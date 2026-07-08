import https from 'https';

const RAPIDAPI_HOST = 'jsearch.p.rapidapi.com';

interface JSearchJob {
  job_id: string;
  job_title: string;
  employer_name: string;
  employer_logo?: string;
  employer_website?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_description?: string;
  job_apply_link?: string;
  job_posted_at?: string;
  job_posted_at_datetime_utc?: string;
  job_salary?: string;
  job_employment_type?: string;
  job_is_remote?: boolean;
  job_required_skills?: string[];
  job_required_experience?: { no_experience_required?: boolean; required_experience_in_months?: number };
  job_highlights?: { Qualifications?: string[]; Responsibilities?: string[] };
}

interface JSearchAPIResponse {
  status: string;
  request_id?: string;
  parameters?: Record<string, unknown>;
  data?: { jobs: JSearchJob[] };
  error?: { message: string; code: number };
}

function rapidRequest(path: string): Promise<JSearchAPIResponse> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: RAPIDAPI_HOST,
      path,
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.JSEARCH_API_KEY || '',
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ status: 'ERROR', error: { message: 'Invalid JSON response', code: 500 } });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

export interface JobSearchResult {
  status: string;
  data: JSearchJob[];
}

export async function searchJobs(query: string, page = 1, numPages = 1): Promise<JobSearchResult> {
  const encoded = encodeURIComponent(query);
  const result = await rapidRequest(`/search-v2?query=${encoded}&page=${page}&num_pages=${numPages}`);

  if (result.status === 'ERROR') {
    return { status: 'ERROR', data: [] };
  }

  return {
    status: result.status,
    data: result.data?.jobs || [],
  };
}

export async function getJobDetails(jobId: string): Promise<JobSearchResult> {
  const result = await rapidRequest(`/job-details?job_id=${encodeURIComponent(jobId)}`);

  if (result.status === 'ERROR') {
    return { status: 'ERROR', data: [] };
  }

  return {
    status: result.status,
    data: result.data?.jobs || [],
  };
}

export function buildQueryFromCV(cvData: Record<string, unknown>): string {
  const parts: string[] = [];

  if (cvData.title) parts.push(cvData.title as string);

  if (Array.isArray(cvData.skills)) {
    const allSkills = cvData.skills.flatMap((s: Record<string, unknown>) => {
      if (Array.isArray(s.skills)) return s.skills as string[];
      return [];
    });
    if (allSkills.length > 0) parts.push(allSkills.slice(0, 5).join(' '));
  }

  if (Array.isArray(cvData.experience)) {
    const titles = cvData.experience
      .map((e: Record<string, unknown>) => e.title as string)
      .filter(Boolean);
    if (titles.length > 0 && !cvData.title) {
      parts.unshift(titles[0]);
    }
  }

  return parts.join(' ') || 'software developer';
}
