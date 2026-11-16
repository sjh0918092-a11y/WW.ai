/* Responses API용 텍스트 모델과 생각 수준. 생성 요청에는 도구·파일·외부 URL을 넣지 않는다. */
export const isOpenAITextModel=id=>typeof id==='string'&&/^(?:gpt-(?:4(?:\.1|o)(?:-[A-Za-z0-9._-]+)?|[5-9][A-Za-z0-9._-]*)|o[3-9](?:-[A-Za-z0-9._-]+)?)$/.test(id)&&!/image|audio|realtime|transcribe|tts|search|deep-research/i.test(id);
export function openAILevels(model){
 if(!isOpenAITextModel(model)||/^gpt-4/.test(model))return [];
 const levels=['low','medium','high'];
 if(/^gpt-5(?:-(?:mini|nano))?(?:-\d{4}-\d{2}-\d{2})?$/.test(model))levels.unshift('minimal');
 else if(/^gpt-(?:5\.[1-9]|[6-9])/.test(model)&&!/^gpt-(?:6-astra|6\.1-sol)/.test(model))levels.unshift('none');
 if(/^gpt-(?:5\.[2-9]|[6-9])/.test(model))levels.push('xhigh');
 if(/^gpt-[6-9]/.test(model))levels.push('max');
 if(/^gpt-5-pro(?:-|$)/.test(model))return ['high'];
 if(/-pro(?:-|$)/.test(model))return levels.filter(x=>['medium','high','xhigh','max'].includes(x));
 return levels;
}
export function openAIThinking(model,level=''){
 if(!level)return {};
 const levels=openAILevels(model),effort=level==='minimal'&&!levels.includes('minimal')?'low':level;
 if(!levels.includes(effort))throw{code:'unsupported_thinking',definite:true,safeMessage:'이 OpenAI 모델이 지원하는 생각 수준을 선택해 주세요.'};
 return {reasoning:{effort}};
}
// 짧은 비암호 해시(FNV-1a). 캐시 라우팅용 이름일 뿐이며 본문을 드러내지 않는다.
const cacheKey=text=>{let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(36);};
export function openAIRequest(model,input){
 const json=input.generationConfig?.responseMimeType==='application/json';
 const system=(input.systemInstruction?.parts||[]).map(p=>p.text).join('\n');
 return {model,store:false,service_tier:"default",max_output_tokens:/^gpt-4o/.test(model)?16384:32768,...openAIThinking(model,input.generationConfig?.thinkingConfig?.thinkingLevel),
  input:input.contents.map(c=>({role:c.role==='model'?'assistant':'user',content:c.parts.map(p=>p.text).join('')})),
  // 캐시 경계로 나뉜 요청은 첫 조각(공통 지침)으로 같은 캐시 서버에 모이게 한다. 경계가 없으면 넣지 않는다.
  ...(input.contents[0]?.parts?.length>1?{prompt_cache_key:'ww-'+cacheKey(input.contents[0].parts[0].text)}:{}),
  ...(system||json?{instructions:[system,json?'Return only a valid JSON value. Do not wrap it in Markdown fences.':''].filter(Boolean).join('\n\n')}:{}),
  ...(json?{text:{format:{type:'json_object'}}}:{})};
}
export function normalizeOpenAI(result){
 if(result?.error||!['completed','incomplete'].includes(result?.status)||!Array.isArray(result.output))throw{code:'invalid_response',definite:true};
 const content=result.output.filter(item=>item.type==='message').flatMap(item=>Array.isArray(item.content)?item.content:[]);
 const refused=content.some(part=>part.type==='refusal')||result.incomplete_details?.reason==='content_filter';
 const parts=content.filter(part=>part.type==='output_text'&&typeof part.text==='string').map(part=>({text:part.text}));
 if(!parts.length&&!refused)throw{code:'empty_response',definite:true};
 if(result.status==='incomplete'&&!['max_output_tokens','content_filter'].includes(result.incomplete_details?.reason))throw{code:'invalid_response',definite:true};
 const usage=result.usage,details=usage?.input_tokens_details,thought=Math.min(usage?.output_tokens||0,usage?.output_tokens_details?.reasoning_tokens||0);
 const writes=details?.cache_write_tokens,writeDetails=details?.cache_write_tokens_details;
 return {candidates:refused?[]:[{content:{parts},finishReason:result.status==='incomplete'?'MAX_TOKENS':'STOP'}],
  ...(refused?{promptFeedback:{blockReason:'REFUSED'}}:{}),
  ...(usage?{usageMetadata:{promptTokenCount:usage.input_tokens,candidatesTokenCount:Number.isFinite(usage.output_tokens)?Math.max(0,usage.output_tokens-thought):undefined,thoughtsTokenCount:thought,cachedContentTokenCount:details?.cached_tokens||0,
   ...(/^gpt-(?:5\.[6-9]|[6-9])/.test(result.model||"")&&!Number.isFinite(writes)?{complete:false}:{}),
   ...(Number.isFinite(writes)?{cacheCreationInputTokenCount:writes,cacheCreation30mInputTokenCount:writeDetails?.ttl_30m_tokens??writes,cacheCreation12hInputTokenCount:writeDetails?.ttl_12h_tokens||0}:{})}}:{})};
}
