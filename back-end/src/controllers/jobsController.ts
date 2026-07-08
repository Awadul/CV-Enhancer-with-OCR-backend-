import { Request, Response } from 'express';
import { searchJobs, buildQueryFromCV } from '../utils/jobSearch';

export async function searchJobsHandler(req: Request, res: Response) {
  try {
    const { query, location, page, numPages, cvData } = req.body;

    let searchQuery = query;

    if (!searchQuery && cvData) {
      searchQuery = buildQueryFromCV(cvData as Record<string, unknown>);
    }

    if (!searchQuery) {
      return res.status(400).json({ message: 'No search query provided. Send a query string or cvData for auto-matching.' });
    }

    if (location) searchQuery = `${searchQuery} in ${location}`;

    const result = await searchJobs(searchQuery, page || 1, numPages || 1);

    if (result.status === 'ERROR') {
      return res.status(500).json({ message: 'Job search failed' });
    }

    const sanitized = result.data.map(job => ({
      job_id: job.job_id,
      job_title: job.job_title,
      employer_name: job.employer_name,
      employer_logo: job.employer_logo,
      job_city: job.job_city,
      job_state: job.job_state,
      job_country: job.job_country,
      job_description: job.job_description?.slice(0, 1000),
      job_apply_link: job.job_apply_link,
      job_posted_at: job.job_posted_at,
      job_salary: job.job_salary,
      job_employment_type: job.job_employment_type,
      job_is_remote: job.job_is_remote,
      job_required_skills: job.job_required_skills,
    }));

    res.json({ status: 'OK', data: sanitized });
  } catch (error) {
    console.error('Error in job search:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
}
