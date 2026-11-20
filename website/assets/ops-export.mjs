/* CSV exports for authorized, already-loaded console data. No API or persistent storage. */
export const MAX_EXPORT_ROWS=500;
const stringValue=value=>{
  if(value===null||value===undefined)return '';
  if(typeof value==='object')return JSON.stringify(value);
  return String(value);
};
export function safeCell(value){
  const raw=stringValue(value).replace(/\u0000/g,'');
  // CSV injection protection for Excel, Google Sheets and LibreOffice.
  const safe=/^[\s\uFEFF]*[=+\-@]/u.test(raw)?"'"+raw:raw;
  return '"'+safe.replace(/"/g,'""')+'"';
}
export function toCsv(columns,items,{limit=MAX_EXPORT_ROWS}={}){
  if(!Array.isArray(columns)||!columns.length||!Array.isArray(items))throw new TypeError('Invalid CSV data');
  const n=Math.min(MAX_EXPORT_ROWS,Math.max(0,limit));
  return [columns.map(c=>safeCell(c.label)).join(','),...items.slice(0,n).map(item=>columns.map(c=>safeCell(item?.[c.key])).join(','))].join('\r\n')+'\r\n';
}
const formatTime=value=>Number.isFinite(Number(value))&&Number(value)>0?new Date(Number(value)).toISOString():'';
export function moderationCasesCsv(cases){
  return toCsv([{label:'Case ID',key:'caseId'},{label:'Action',key:'action'},{label:'Target',key:'target'},
    {label:'Target User ID',key:'targetUserId'},{label:'Moderator ID',key:'moderatorId'},
    {label:'Reason',key:'reason'},{label:'Created at (UTC)',key:'timestamp'}],
    (cases||[]).map(c=>({...c,timestamp:formatTime(c.createdAt)})));
}
export function cadHistoryCsv(events){
  return toCsv([{label:'Event ID',key:'id'},{label:'Event',key:'action'},
    {label:'Actor',key:'actorName'},{label:'Actor ID',key:'actorId'},
    {label:'Timestamp (UTC)',key:'timestamp'},{label:'Details',key:'details'}],
    (events||[]).map(e=>({...e,timestamp:formatTime(e.at)})));
}
export function downloadCsv(filename,csv){
  if(typeof filename!=='string'||!/^[A-Za-z0-9_.-]+\.csv$/.test(filename))throw new Error('Invalid export filename');
  const blob=new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=filename;link.style.display='none';
  document.body.append(link);
  try{link.click()}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
