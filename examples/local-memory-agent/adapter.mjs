// Reference adapter: retrieval, prompts, and memory remain in this process.
export async function callAstrailTool({baseUrl,apiKey,taskAuthorization,serverId,toolName,arguments:args}){
 const response=await fetch(`${baseUrl}/api/local-agent/tool-request`,{method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},body:JSON.stringify({server_id:serverId,tool_name:toolName,arguments:args,task_authorization:taskAuthorization})});
 if(!response.ok)throw new Error(`Astrail tool call failed: ${response.status}`);return response.json();
}
export async function runLocalAgent(input){const localMemory={recentTasks:[],privateNotes:input.privateNotes??""};const selected={owner:input.owner,repo:input.repo,state:"open"};const result=await callAstrailTool({...input,toolName:"github_list_issues",arguments:selected});localMemory.recentTasks.push({tool:"github_list_issues",count:result?.result?.content?.length??0});return{result,localMemory};}
