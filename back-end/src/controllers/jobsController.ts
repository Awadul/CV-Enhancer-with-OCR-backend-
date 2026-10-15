import { searchRemoteJobs } from '../utils/remoteJobs';
import { Request, Response } from 'express';
import { searchJobs, buildQueryFromCV } from '../utils/jobSearch';
import { readPublicJobPage, extractStructuredJob } from '../utils/publicJobPage';

export async function searchJobsHandler(req: Request, res: Response) {
  try {
    const { query, location, page, numPages, cvData, country } = req.body;

    const supported = ['us','gb','au','ca','de','fr','in','nl','nz','pl','sg','za','br','at','be','ch','es','it','mx'];
    if ((query !== undefined && (typeof query !== 'string' || query.length > 200)) || (location !== undefined && (typeof location !== 'string' || location.length > 120)) || (country !== undefined && (typeof country !== 'string' || !supported.includes(country.toLowerCase()))) || (page !== undefined && (!Number.isInteger(page) || page < 1 || page > 5)) || (numPages !== undefined && (!Number.isInteger(numPages) || numPages !== 1)) || (cvData !== undefined && (!cvData || typeof cvData !== 'object' || Array.isArray(cvData) || JSON.stringify(cvData).length > 60000))) return res.status(400).json({message:'Use a short search, a supported country and a page from 1 to 5.'});
    let searchQuery = query?.trim();

    if (!searchQuery && cvData) {
      searchQuery = buildQueryFromCV(cvData as Record<string, unknown>);
    }

    if (!searchQuery) {
      return res.status(400).json({ message: 'No search query provided. Send a query string or cvData for auto-matching.' });
    }

    if (location) searchQuery = `${searchQuery} ${location}`;

    const result = await searchJobs(searchQuery, page || 1, numPages || 1, country || 'us');

    if (result.status === 'ERROR') {
      return res.status(503).json({ message: 'Our job listing provider is unavailable. Please try again shortly.', code: 'JOB_PROVIDER_UNAVAILABLE' });
    }

    const sanitized = result.data.map(job => ({
      job_id: job.job_id,
      job_title: job.job_title,
      employer_name: job.employer_name,
      employer_logo: job.employer_logo || null,
      job_city: job.job_city,
      job_state: job.job_state,
      job_country: job.job_country,
      job_description: job.job_description?.slice(0, 20000),
      job_apply_link: job.job_apply_link,
      job_posted_at: job.job_posted_at,
      job_salary: job.job_salary,
      job_employment_type: job.job_employment_type,
      job_is_remote: job.job_is_remote,
      job_required_skills: job.job_required_skills,
    }));

    res.json({ status: 'OK', data: sanitized, source: 'Adzuna', fetched_at: new Date().toISOString(), country: country || 'us' });
  } catch (error) {
    console.error('Error in job search:', error);
    res.status(503).json({ message: 'Job search is temporarily unavailable. Please try again later or contact support if this continues.', code: 'JOB_SEARCH_UNAVAILABLE' });
  }
}

export async function extractFromUrlHandler(req: Request, res: Response) {
  if (typeof req.body?.url !== 'string') return res.status(400).json({message:'Add a public HTTPS job link.'});
  try {
    const page = await readPublicJobPage(req.body.url);
    const job = extractStructuredJob(page.html, page.url);
    return res.json({ job_id: `url-${Date.now()}`, ...job });
  } catch {
    return res.status(422).json({ message: 'This link could not be read safely. Paste the job title and description instead; your CV is unchanged.' });
  }
}

export async function remoteJobsHandler(req:Request,res:Response){
 const {query,location=''}=req.body||{};
 if(typeof query!=='string'||!query.trim()||query.length>200||typeof location!=='string'||location.length>120)return res.status(400).json({message:'Enter a role or skill under 200 characters and an optional location under 120.'});
 try{return res.json(await searchRemoteJobs(query.trim(),location.trim()));}catch{return res.status(503).json({message:'The remote job feed is unavailable. You can still import a job link or paste a posting.'});}
}
