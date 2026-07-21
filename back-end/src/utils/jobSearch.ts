import https from 'https';

const ADZUNA_BASE_URL = 'api.adzuna.com';
const DEFAULT_COUNTRY = 'us';

interface AdzunaJob {
  id: string;
  title: string;
  description: string;
  redirect_url: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted: number;
  created: string;
  location: {
    display_name: string;
    area: string[];
  };
  company: {
    display_name: string;
  };
  category: {
    label: string;
    tag: string;
  };
  contract_type?: string;
  contract_time?: string;
}

interface AdzunaAPIResponse {
  __CLASS__: string;
  results: AdzunaJob[];
  count: number;
  error?: string;
}

function adzunaRequest(path: string): Promise<AdzunaAPIResponse> {
  return new Promise((resolve, reject) => {
    const appId = process.env.ADZUNA_APP_ID || '';
    const appKey = process.env.ADZUNA_APP_KEY || '';
    const separator = path.includes('?') ? '&' : '?';
    const fullPath = `${path}${separator}app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}&content-type=application/json`;

    const options = {
      hostname: ADZUNA_BASE_URL,
      path: fullPath,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) {
            console.error('[Adzuna API Error]', parsed.error);
          }
          resolve(parsed);
        } catch {
          console.error('[Adzuna API] Invalid JSON response:', body.slice(0, 200));
          resolve({ __CLASS__: '', results: [], count: 0, error: 'Invalid JSON response' });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[Adzuna API] Request error:', err.message);
      reject(err);
    });
    req.end();
  });
}

export interface JobSearchResult {
  status: string;
  data: Job[];
}

export interface Job {
  job_id: string;
  job_title: string;
  employer_name: string;
  employer_logo?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_description?: string;
  job_apply_link?: string;
  job_posted_at?: string;
  job_salary?: string;
  job_employment_type?: string;
  job_is_remote?: boolean;
  job_required_skills?: string[];
}

function formatSalary(min?: number, max?: number): string {
  if (!min && !max) return '';
  const fmt = (n: number) => {
    if (n >= 1000) return `$${Math.round(n / 1000)}k`;
    return `$${n}`;
  };
  if (min && max) return `${fmt(min)} - ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  return `Up to ${fmt(max!)}`;
}

function mapContractType(contractType?: string, contractTime?: string): string {
  const type = contractType || '';
  const time = contractTime || '';
  if (time === 'full_time') return 'Full-time';
  if (time === 'part_time') return 'Part-time';
  if (type === 'permanent') return 'Full-time';
  if (type === 'contract') return 'Contract';
  if (type === 'temporary') return 'Temporary';
  if (type === 'apprenticeship') return 'Internship';
  return type || '';
}

function mapAdzunaJob(job: AdzunaJob): Job {
  const locationParts = job.location?.area || [];
  const city = locationParts.length > 2 ? locationParts[locationParts.length - 1] : '';
  const state = locationParts.length > 1 ? locationParts[locationParts.length - 2] : '';
  const country = locationParts.length > 0 ? locationParts[0] : '';

  return {
    job_id: job.id,
    job_title: job.title,
    employer_name: job.company?.display_name || 'Unknown',
    job_city: city || job.location?.display_name?.split(',')[0] || '',
    job_state: state,
    job_country: country,
    job_description: job.description?.slice(0, 1000) || '',
    job_apply_link: job.redirect_url || '',
    job_posted_at: job.created || '',
    job_salary: formatSalary(job.salary_min, job.salary_max),
    job_employment_type: mapContractType(job.contract_type, job.contract_time),
    job_is_remote: false,
    job_required_skills: [],
  };
}

export async function searchJobs(query: string, page = 1, numPages = 1, country = DEFAULT_COUNTRY): Promise<JobSearchResult> {
  const encoded = encodeURIComponent(query);
  const resultsPerPage = Math.min(20, numPages * 20);
  const countryCode = (country || DEFAULT_COUNTRY).toLowerCase().slice(0, 2);
  const path = `/v1/api/jobs/${countryCode}/search/${page}?what=${encoded}&results_per_page=${resultsPerPage}`;

  const result = await adzunaRequest(path);

  if (result.error) {
    return { status: 'ERROR', data: [] };
  }

  const jobs = (result.results || []).map(mapAdzunaJob);

  return {
    status: jobs.length > 0 ? 'OK' : 'OK',
    data: jobs,
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
