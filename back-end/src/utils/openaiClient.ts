import OpenAI from 'openai';

export const sendToOpenAI = async (content: string) => {
  const startTime = Date.now();
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Prepare all OpenAI API calls as promises
  const personalInfoPromise = openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: `You are pdf parser. Extract all information from pdf. For the "summary" field, if the CV contains a professional summary, extract it. If it does NOT contain a summary, you MUST generate a professional summary in the FIRST PERSON based on their experience and skills.

Summary Requirements:
- Write as if the candidate is introducing themselves.
- Use "I" naturally and professionally.
- Do NOT use the candidate's name anywhere in the summary.
- Avoid phrases such as "This candidate", "He is", or other third-person references.
- Focus on technical expertise, project impact, problem-solving ability, and career interests.
- Make the writing sound authentic and human rather than AI-generated.
- Avoid generic buzzwords and exaggerated claims.
- Keep the tone confident, concise, and professional.

For the "title" field, extract the candidate's professional title from the CV. If it is NOT explicitly mentioned, you MUST generate a concise professional title (e.g., "Software Engineer", "Data Scientist") that best represents their experience to showcase the position the candidate is applying for.

For all other fields, if they are not mentioned, don't fill them in. Find only personal links in pdf. Output only JSON, no explanation.

        JSON Format 
        {
          "first_name": "",
          "last_name": "",
          "title": "",
          "contact": {
            "phone": "",
            "email": "",
            "location": "",
            "links": {
              title: url
            }
          },
          "summary": "",
          "education": [
            {
              "degree": "",
              "field": "",
              "institution": "",
              "start_date": yyyy-mm,
              "end_date":yyyy-mm,
            }
          ],
          "certifications": [
            {
              "name": "",
              "issuer": "",
              "date": ""
            }
          ],
          "internship_volunteering":[
            {
              "involvement":"",
              "organization":"",
              "description: "",
              "start_date": yyyy-mm,
              "end_date":yyyy-mm,
            }
          ],
          "languages_spoken": [
            {
              language:"",
              level:'A1'?'A2'?'B1'?'B2'?'C1'?:'C2'?:'Basic'?:'Beginner'?:'Intermediate'?:'Upper Intermediate'?:'Advanced'?:'Native'?
            },
          ],
        }` },
      { role: 'user', content: `Here is the content of the pdf:\n${content}` },
    ],
    temperature: 0.1,
    max_tokens: 8192,
  });

  const experiencePromise = openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: `Extract all the experience information from the pdf. If there is no required information, don't need fill the field. Output only JSON, no explanation.

        JSON Format 
        "experience": [
          {
            "title": "",
            "company": "",
            "location": "",
            "type": "",
            "start_date": yyyy-mm,
            "end_date":yyyy-mm,
            "summary": "",
            "description":[],
          },
        ]` },
      { role: 'user', content: `Here is the content of the pdf:\n${content}` },
    ],
    temperature: 0.1,
    max_tokens: 8192,
  });

  const projectPromise = openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: `Extract all the projects information from the pdf, not work experience. If there is no information about project, fill [] in that field. Output only JSON, no explanation.

        JSON Format 
        "projects": [
          {
            "project_name": "Project Name",
            "organization": "Company or Personal",
            "start_date": "yyyy-mm",
            "end_date": "yyyy-mm",
            "description": "Short description",
            "technologies": ["Tech 1", "Tech 2"]
          }
        ]`},
      { role: 'user', content: `Here is the content of the pdf:\n${content}` },
    ],
    temperature: 0.1,
    max_tokens: 8192,
  });

  const skillsPromise = openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: `Extract all only tech-skill information from the pdf. If there is no requried information, fill {} in that field. Output only JSON, no explanation.

        JSON Format 
          "skills": {
            category: category_name,
            skills: [skill1, skill2],
            level: 'Beginner'?'Intermediate'?'Advanced'?'Expert'
          },`},
      { role: 'user', content: `Here is the content of the pdf:\n${content}` },
    ],
    temperature: 0.0,
    max_tokens: 8192,
  });

  // Run all API calls in parallel
  const [response_persoanl_info, response_experience, response_project, response_skills] = await Promise.all([
    personalInfoPromise,
    experiencePromise,
    projectPromise,
    skillsPromise,
  ]);

  // Process personal info
  const result_personal_info_string = response_persoanl_info.choices[0].message?.content;
  let json_personal_info = result_personal_info_string?.trim() || '{}';
  if (json_personal_info.startsWith('```json\n') && json_personal_info.endsWith('```')) {
    json_personal_info = json_personal_info.slice(7, -3).trim();
  }
  let result_personal_info;
  try {
    result_personal_info = JSON.parse(json_personal_info);
  } catch (jsonError) {
    result_personal_info = { message: 'Failed to parse OpenAI response as JSON', error: (jsonError as Error).message, raw: result_personal_info_string };
  }

  // Process experience
  const result_experience_string = response_experience.choices[0].message?.content;
  let json_experience = result_experience_string?.trim() || '{}';
  if (json_experience.startsWith('```json\n') || json_experience.endsWith('```')) {
    json_experience = json_experience.slice(7, -3).trim();
  }
  let result_experience;
  try {
    result_experience = JSON.parse(json_experience);
  } catch (jsonError) {
    result_experience = { message: 'Failed to parse OpenAI response as JSON', error: (jsonError as Error).message, raw: result_experience_string };
  }

  // Process projects
  const result_project_string = response_project.choices[0].message?.content;
  let json_project = result_project_string?.trim() || '{}';
  if (json_project.startsWith('```json\n') || json_project.endsWith('```')) {
    json_project = json_project.slice(7, -3).trim();
  }
  let result_project;
  try {
    result_project = JSON.parse(json_project);
  } catch (jsonError) {
    result_project = { message: 'Failed to parse OpenAI response as JSON', error: (jsonError as Error).message, raw: result_project_string };
  }

  // Process skills
  const result_skills_string = response_skills.choices[0].message?.content;
  let json_skills = result_skills_string?.trim() || '{}';
  if (json_skills.startsWith('```json\n') || json_skills.endsWith('```')) {
    json_skills = json_skills.slice(7, -3).trim();
  }
  let result_skills;
  try {
    result_skills = JSON.parse(json_skills);
  } catch (jsonError) {
    result_skills = { message: 'Failed to parse OpenAI response as JSON', error: (jsonError as Error).message, raw: result_skills_string };
  }

  const endTime = Date.now();
  console.log(`sendToOpenAI execution time: ${endTime - startTime} ms`);

  return {
    ...result_personal_info,
    experience: result_experience.experience || [],
    projects: result_project.projects || [],
    skills: result_skills.skills || {},
  };
}; 