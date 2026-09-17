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
      { role: 'system', content: `Extract all only tech-skill information from the pdf. If there is no requried information, fill [] in that field. Output only JSON, no explanation.

        JSON Format 
        "skills": [
          {
            "category": "category_name (e.g. Programming Languages, Frameworks, Tools)",
            "skills": ["skill1", "skill2"],
            "level": "Expert"
          }
        ]`},
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
    skills: result_skills.skills || [],
  };
};

export const evaluateATS = async (cvData: any) => {
  const startTime = Date.now();
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert ATS (Applicant Tracking System) evaluator. Evaluate the provided CV data against standard ATS screening algorithms and recruitment best practices.
        
        Evaluate based on these 5 predefined criteria:
        1. Contact Information (checks if email, phone, location, and relevant links are present)
        2. Quantifiable Achievements (checks if descriptions contain metrics, percentages, numbers, or dollar values)
        3. Formatting & Dates (checks if date fields are filled and standard, and structure is clean)
        4. Skills & Categorization (checks if skills are categorized and complete)
        5. Action Verbs (checks if experience bullets start with strong, impactful action verbs)

        Provide an overall score out of 100, status ('pass' or 'fail') and details for each of the 5 criteria, a list of missing things, and a list of specific recommended improvements.
        
        Output ONLY a JSON object conforming exactly to this structure (with no extra wrapping keys or comments outside the JSON):
        {
          "score": number,
          "criteria": [
            { "name": "Contact Information", "status": "pass" | "fail", "details": "explanation of what is good or needs work" },
            { "name": "Quantifiable Achievements", "status": "pass" | "fail", "details": "..." },
            { "name": "Formatting & Dates", "status": "pass" | "fail", "details": "..." },
            { "name": "Skills & Categorization", "status": "pass" | "fail", "details": "..." },
            { "name": "Action Verbs", "status": "pass" | "fail", "details": "..." }
          ],
          "missingThings": ["string", "string"],
          "improvements": ["string", "string"]
        }`
      },
      {
        role: 'user',
        content: `Evaluate this CV Data JSON:\n${JSON.stringify(cvData, null, 2)}`
      }
    ],
    temperature: 0.2,
    response_format: { type: "json_object" }
  });

  const resultString = response.choices[0].message?.content;
  let jsonString = resultString?.trim() || '{}';
  if (jsonString.startsWith('```json\n') && jsonString.endsWith('```')) {
    jsonString = jsonString.slice(7, -3).trim();
  }

  const endTime = Date.now();
  console.log(`evaluateATS execution time: ${endTime - startTime} ms`);
  return JSON.parse(jsonString);
};

export const optimizeATS = async (cvData: any) => {
  const startTime = Date.now();
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert resume writer and ATS optimization specialist.
        Optimize the provided CV Data JSON to make it highly compatible with Applicant Tracking Systems (ATS) and professional recruiters.
        
        Optimization Requirements:
        1. Professional Summary: Ensure the summary is written in the FIRST PERSON using "I" naturally. Ensure it's professional, concise (2-4 sentences), and includes key keywords.
        2. Experience (Employment History): 
           - Rewrite all description bullet points to start with strong, professional action verbs (e.g., "Spearheaded", "Architected", "Engineered", "Implemented", "Enhanced", "Slashed").
           - Add realistic and contextual quantifiable achievements/metrics (e.g. percentages, load time improvements, cost reductions) where logical to describe the impact of their duties. DO NOT invent completely fake credentials, but enhance existing responsibilities with typical engineering/industry metrics.
        3. Skills: Ensure skills are well-categorized and clearly formatted.
        4. Languages: Ensure level names are clean.
        5. Conform strictly to the CVData schema. Do not omit any existing valid information.

        Output ONLY a JSON object conforming exactly to this structure (CVData schema, with no extra wrapping keys or comments outside the JSON):
        {
          "first_name": "string",
          "last_name": "string",
          "title": "string",
          "contact": {
            "phone": "string",
            "email": "string",
            "location": "string",
            "links": {
              "title": "url"
            }
          },
          "summary": "string",
          "education": [
            {
              "degree": "string",
              "field": "string",
              "institution": "string",
              "start_date": "yyyy-mm",
              "end_date": "yyyy-mm"
            }
          ],
          "certifications": [
            {
              "name": "string",
              "issuer": "string",
              "date": "string"
            }
          ],
          "internship_volunteering": [
            {
              "involvement": "string",
              "organization": "string",
              "description": "string",
              "start_date": "yyyy-mm",
              "end_date": "yyyy-mm"
            }
          ],
          "languages_spoken": [
            {
              "language": "string",
              "level": "string"
            }
          ],
          "experience": [
            {
              "title": "string",
              "company": "string",
              "location": "string",
              "type": "string",
              "start_date": "yyyy-mm",
              "end_date": "yyyy-mm",
              "summary": "string",
              "description": ["bullet 1", "bullet 2"]
            }
          ],
          "projects": [
            {
              "project_name": "string",
              "organization": "string",
              "start_date": "yyyy-mm",
              "end_date": "yyyy-mm",
              "description": "string",
              "technologies": ["tech1", "tech2"]
            }
          ],
          "skills": [
            {
              "category": "string",
              "skills": ["skill1", "skill2"],
              "level": "Beginner" | "Intermediate" | "Advanced" | "Expert"
            }
          ]
        }`
      },
      {
        role: 'user',
        content: `Optimize this CV Data JSON:\n${JSON.stringify(cvData, null, 2)}`
      }
    ],
    temperature: 0.3,
    response_format: { type: "json_object" }
  });

  const resultString = response.choices[0].message?.content;
  let jsonString = resultString?.trim() || '{}';
  if (jsonString.startsWith('```json\n') && jsonString.endsWith('```')) {
    jsonString = jsonString.slice(7, -3).trim();
  }

  const endTime = Date.now();
  console.log(`optimizeATS execution time: ${endTime - startTime} ms`);
  return JSON.parse(jsonString);
};