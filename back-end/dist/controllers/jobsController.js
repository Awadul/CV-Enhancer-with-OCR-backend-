"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchJobsHandler = searchJobsHandler;
exports.extractFromUrlHandler = extractFromUrlHandler;
const jobSearch_1 = require("../utils/jobSearch");
const openai_1 = __importDefault(require("openai"));
async function searchJobsHandler(req, res) {
    try {
        const { query, location, page, numPages, cvData, country } = req.body;
        let searchQuery = query;
        if (!searchQuery && cvData) {
            searchQuery = (0, jobSearch_1.buildQueryFromCV)(cvData);
        }
        if (!searchQuery) {
            return res.status(400).json({ message: 'No search query provided. Send a query string or cvData for auto-matching.' });
        }
        if (location)
            searchQuery = `${searchQuery} ${location}`;
        const result = await (0, jobSearch_1.searchJobs)(searchQuery, page || 1, numPages || 1, country || 'us');
        if (result.status === 'ERROR') {
            return res.status(500).json({ message: 'Job search failed' });
        }
        const sanitized = result.data.map(job => ({
            job_id: job.job_id,
            job_title: job.job_title,
            employer_name: job.employer_name,
            employer_logo: job.employer_logo || null,
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
    }
    catch (error) {
        console.error('Error in job search:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
}
async function extractFromUrlHandler(req, res) {
    try {
        const { url } = req.body;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ message: 'A valid URL is required' });
        }
        let html = '';
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                redirect: 'follow',
            });
            if (!response.ok) {
                return res.status(400).json({ message: `Could not fetch URL: HTTP ${response.status}` });
            }
            html = await response.text();
        }
        catch (fetchErr) {
            return res.status(400).json({ message: 'Could not fetch the URL. Make sure it is a valid, publicly accessible job listing URL.' });
        }
        const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `Extract job listing details from the HTML content. Return JSON only with this structure:
{
  "job_title": "",
  "employer_name": "",
  "job_description": "",
  "job_city": "",
  "job_state": "",
  "job_apply_link": "",
  "job_salary": "",
  "job_employment_type": "",
  "job_is_remote": false,
  "job_required_skills": []
}
Rules:
- Extract only what is clearly present in the page
- If a field is not found, leave it as empty string or false
- Do not make up information`,
                },
                {
                    role: 'user',
                    content: `Extract job details from this page:\n\n${html.slice(0, 15000)}`,
                },
            ],
            temperature: 0.1,
            max_tokens: 2048,
        });
        let raw = completion.choices[0].message?.content?.trim() || '{}';
        if (raw.startsWith('```json\n'))
            raw = raw.slice(7);
        if (raw.endsWith('```'))
            raw = raw.slice(0, -3);
        const jobData = JSON.parse(raw.trim());
        res.json({
            job_id: `url-${Date.now()}`,
            job_apply_link: url,
            ...jobData,
        });
    }
    catch (error) {
        console.error('Error extracting job from URL:', error);
        res.status(500).json({ message: 'Failed to extract job details from URL', error: error.message });
    }
}
