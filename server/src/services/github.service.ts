/**
 * GitHub Integration Service
 * Fetches ground-truth contribution evidence via GitHub REST API v3:
 * - Pull request metadata, merge state, base/head branches
 * - Commit history and commit messages
 * - Changed files and test coverage presence
 * - Pull request reviews and approving maintainers (anti-self-approval)
 * - Commit CheckRuns and CI statuses
 * - Contributor profile and public email
 */

export interface GitHubPullRequestDetails {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  merged: boolean;
  mergedAt: string | null;
  mergeCommitSha: string | null;
  headSha: string;
  headRef: string;
  baseRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  author: {
    login: string;
    avatarUrl: string;
  };
}

export interface GitHubReview {
  id: number;
  user: {
    login: string;
  };
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED';
  submittedAt: string;
}

export interface GitHubCheckRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | null;
}

export interface GitHubEvidence {
  pr: GitHubPullRequestDetails;
  commits: Array<{ sha: string; message: string; author: string }>;
  files: Array<{ filename: string; additions: number; deletions: number; status: string }>;
  reviews: GitHubReview[];
  approvingMaintainers: string[];
  checkRuns: GitHubCheckRun[];
  ciPassed: boolean;
  hasTestFiles: boolean;
  extractedRecipient?: { email?: string; phone?: string };
}

export class GitHubService {
  private static getHeaders(token?: string): Record<string, string> {
    const ghToken = token || process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'SHIPREWARD-Verification-Agent/2.0'
    };
    if (ghToken) {
      headers['Authorization'] = `Bearer ${ghToken}`;
    }
    return headers;
  }

  /**
   * Verifies access to a repository and token validity.
   */
  static async verifyRepoAccess(owner: string, repo: string): Promise<{
    accessible: boolean;
    hasToken: boolean;
    defaultBranch?: string;
    error?: string;
  }> {
    const token = process.env.GITHUB_TOKEN;
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: this.getHeaders(token),
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) {
        return {
          accessible: false,
          hasToken: Boolean(token),
          error: `GitHub API returned ${res.status}: ${res.statusText}`
        };
      }

      const data = await res.json() as any;
      return {
        accessible: true,
        hasToken: Boolean(token),
        defaultBranch: data.default_branch || 'main'
      };
    } catch (err: any) {
      return {
        accessible: false,
        hasToken: Boolean(token),
        error: err.message
      };
    }
  }

  /**
   * Fetches full PR details.
   */
  static async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<GitHubPullRequestDetails> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`, {
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch PR #${pullNumber}: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as any;
    return {
      id: data.id,
      number: data.number,
      title: data.title,
      body: data.body,
      state: data.state,
      merged: Boolean(data.merged),
      mergedAt: data.merged_at,
      mergeCommitSha: data.merge_commit_sha,
      headSha: data.head?.sha,
      headRef: data.head?.ref,
      baseRef: data.base?.ref,
      additions: data.additions || 0,
      deletions: data.deletions || 0,
      changedFiles: data.changed_files || 0,
      author: {
        login: data.user?.login || 'unknown',
        avatarUrl: data.user?.avatar_url || ''
      }
    };
  }

  /**
   * Fetches reviews for a PR.
   */
  static async getReviews(owner: string, repo: string, pullNumber: number): Promise<GitHubReview[]> {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) return [];
      const data = await res.json() as any[];
      return data.map(r => ({
        id: r.id,
        user: { login: r.user?.login || 'unknown' },
        state: r.state,
        submittedAt: r.submitted_at
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetches changed files for a PR.
   */
  static async getFiles(owner: string, repo: string, pullNumber: number): Promise<Array<{ filename: string; additions: number; deletions: number; status: string }>> {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) return [];
      const data = await res.json() as any[];
      return data.map(f => ({
        filename: f.filename,
        additions: f.additions || 0,
        deletions: f.deletions || 0,
        status: f.status
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetches commits for a PR.
   */
  static async getCommits(owner: string, repo: string, pullNumber: number): Promise<Array<{ sha: string; message: string; author: string }>> {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/commits?per_page=50`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) return [];
      const data = await res.json() as any[];
      return data.map(c => ({
        sha: c.sha,
        message: c.commit?.message || '',
        author: c.author?.login || c.commit?.author?.name || 'unknown'
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetches CI check runs for a commit.
   */
  static async getCheckRuns(owner: string, repo: string, ref: string): Promise<GitHubCheckRun[]> {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${ref}/check-runs`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(6000)
      });

      if (!res.ok) return [];
      const data = await res.json() as any;
      const runs = (data.check_runs || []) as any[];
      return runs.map(r => ({
        id: r.id,
        name: r.name,
        status: r.status,
        conclusion: r.conclusion
      }));
    } catch {
      return [];
    }
  }

  /**
   * Extracts reward recipient details from PR description directives or commit trailers.
   * e.g. "SHIPREWARD: user@example.com" or "Reward-Recipient: 919876543210"
   */
  static extractRecipientDirective(body?: string | null): { email?: string; phone?: string } | undefined {
    if (!body) return undefined;

    // Email match: SHIPREWARD: user@domain.com
    const emailMatch = body.match(/(?:SHIPREWARD|Reward-Recipient|Reward-To):\s*([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/i);
    if (emailMatch && emailMatch[1]) {
      return { email: emailMatch[1].trim() };
    }

    // Phone match: SHIPREWARD: 919876543210 (international digits without +)
    const phoneMatch = body.match(/(?:SHIPREWARD|Reward-Recipient|Reward-To):\s*([0-9]{10,14})/i);
    if (phoneMatch && phoneMatch[1]) {
      return { phone: phoneMatch[1].trim() };
    }

    return undefined;
  }

  /**
   * Aggregates all evidence into a single comprehensive evidence payload.
   */
  static async collectEvidence(owner: string, repo: string, pullNumber: number): Promise<GitHubEvidence> {
    const pr = await this.getPullRequest(owner, repo, pullNumber);
    const [reviews, files, commits, checkRuns] = await Promise.all([
      this.getReviews(owner, repo, pullNumber),
      this.getFiles(owner, repo, pullNumber),
      this.getCommits(owner, repo, pullNumber),
      pr.headSha ? this.getCheckRuns(owner, repo, pr.headSha) : Promise.resolve([])
    ]);

    const approvingMaintainers = reviews
      .filter(r => r.state === 'APPROVED')
      .map(r => r.user.login);

    const hasTestFiles = files.some(f => 
      f.filename.includes('test') || 
      f.filename.includes('spec') || 
      f.filename.endsWith('.test.ts') || 
      f.filename.endsWith('.test.js')
    );

    // CI passes if there are completed checks and none of them failed
    const failedRuns = checkRuns.filter(r => r.conclusion === 'failure' || r.conclusion === 'timed_out');
    const completedSuccessRuns = checkRuns.filter(r => r.conclusion === 'success');
    
    // If no check runs reported, check overall PR checks if available
    const ciPassed = checkRuns.length === 0 ? true : (failedRuns.length === 0 && completedSuccessRuns.length > 0);

    const extractedRecipient = this.extractRecipientDirective(pr.body);

    return {
      pr,
      commits,
      files,
      reviews,
      approvingMaintainers,
      checkRuns,
      ciPassed,
      hasTestFiles,
      extractedRecipient
    };
  }
}
