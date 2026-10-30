'use strict';
const storage=require('./homework-storage');
const MAX_ROWS=10000;
const number=n=>{const v=Number(n);return Number.isFinite(v)&&v>0?Math.floor(v):0};
const array=v=>Array.isArray(v)?v:[];
const stamp=n=>{const v=number(n);return v>1000000000000?v:null};
function summaryOf(raw,source){
 const doc=raw&&typeof raw==='object'?raw:{};
 const teams=array(doc.teams);
 const entries=teams.reduce((n,t)=>n+array(t.players).length,0);
 const sorters=teams.reduce((n,t)=>n+array(t.players).filter(p=>number(p.itemsSorted)>0||number(p.contributionPoints)>0||number(p.pointsEarned)>0).length,0);
 const activeMarkers=teams.reduce((n,t)=>n+array(t.players).filter(p=>p.played===true||number(p.itemsSorted)>0||number(p.contributionPoints)>0||number(p.pointsEarned)>0).length,0);
 const teamSorted=teams.reduce((n,t)=>n+number(t.itemsSorted||array(t.items).filter(i=>i.picked).length),0);
 const points=teams.reduce((n,t)=>n+number(t.score),0);
 const started=!!stamp(doc.startedAt)||['playing','finished'].includes(doc.status)||points>0||teamSorted>0;
 return {source,started,status:String(doc.status||'unknown'),date:stamp(doc.startedAt)||stamp(doc.createdAt)||null,
  studentEntries:Math.max(number(doc.playerCount),entries),
  confirmedSorters:sorters,recordedActivity:Math.max(number(doc.playedCount),activeMarkers,sorters),
  itemsSorted:teamSorted,hasActivityTracking:Object.prototype.hasOwnProperty.call(doc,'playedCount')||teams.some(t=>array(t.players).some(p=>p.played===true)),
  hasIndividualSorting:teams.some(t=>array(t.players).some(p=>Number.isFinite(Number(p.itemsSorted))&&p.itemsSorted!==null&&p.itemsSorted!==undefined)),
  teacherId:number(doc.teacherId)||null};
}
async function audit(teacherId){
 if(!storage.isReady())throw Error('Database not connected');
 const [reports,homework]=await Promise.all([
  storage.query('SELECT code,teacher_id,report,updated_at FROM ecoquest_game_reports ORDER BY updated_at DESC LIMIT $1',[MAX_ROWS+1]),
  storage.query('SELECT code,data,updated_at FROM ecoquest_homework ORDER BY updated_at DESC LIMIT $1',[MAX_ROWS+1])
 ]);
 const reportRows=reports.rows.slice(0,MAX_ROWS),homeworkRows=homework.rows.slice(0,MAX_ROWS);
 const truncated=reports.rows.length>MAX_ROWS||homework.rows.length>MAX_ROWS;
 const groups=new Map();
 for(const row of reportRows){
  const code=String(row.code||'').toUpperCase(),part=summaryOf(row.report,'report');
  if(!code)continue;
  let record=groups.get(code);
  if(!record){record={code,teacherId:number(row.teacher_id)||null,parts:[],sources:new Set(),updatedAt:null};groups.set(code,record)}
  record.parts.push(part);record.sources.add('report');
  record.updatedAt=new Date(row.updated_at||0).getTime()||record.updatedAt;
 }
 for(const row of homeworkRows){
  const code=String(row.code||'').toUpperCase(),part=summaryOf(row.data,'homework');
  if(!code)continue;
  let record=groups.get(code);
  if(!record){record={code,teacherId:part.teacherId,parts:[],sources:new Set(),updatedAt:null};groups.set(code,record)}
  if(!record.teacherId)record.teacherId=part.teacherId;
  record.parts.push(part);record.sources.add('homework');
  record.updatedAt=Math.max(record.updatedAt||0,new Date(row.updated_at||0).getTime()||0);
 }
 const all=[...groups.values()].map(rec=>{
  const started=rec.parts.some(p=>p.started);
  const entries=Math.max(0,...rec.parts.map(p=>p.studentEntries));
  const sorters=Math.max(0,...rec.parts.map(p=>p.confirmedSorters));
  const active=Math.max(sorters,...rec.parts.map(p=>p.recordedActivity));
  const date=rec.parts.map(p=>p.date).filter(Boolean).sort((a,b)=>a-b)[0]||rec.updatedAt||null;
  return {code:rec.code,teacherId:rec.teacherId,started,date,status:rec.parts.some(p=>p.status==='finished')?'finished':rec.parts.some(p=>p.status==='playing')?'playing':'lobby',
   source:rec.sources.has('report')&&rec.sources.has('homework')?'both':rec.sources.has('report')?'report only':'homework only',
   entries,sorters,minimumActive:active,activityTrackingComplete:rec.parts.some(p=>p.hasActivityTracking),
   sortedItems:Math.max(0,...rec.parts.map(p=>p.itemsSorted)),
   hasIndividualSorting:rec.parts.some(p=>p.hasIndividualSorting)
  }
 }).sort((a,b)=>(b.date||0)-(a.date||0));
 const started=all.filter(x=>x.started),teacherIds=new Set(started.map(x=>x.teacherId).filter(Boolean));
 const total=xs=>xs.reduce((n,x)=>n+x,0);
 const sources={reportOnly:all.filter(x=>x.source==='report only').length,homeworkOnly:all.filter(x=>x.source==='homework only').length,inBoth:all.filter(x=>x.source==='both').length};
 return {
  coverage:{savedGameCodes:all.length,startedGameCodes:started.length,notStartedOrUncertain:all.length-started.length,
   reportsAvailable:reportRows.length,homeworkRecordsAvailable:homeworkRows.length,sourceOverlap:sources,truncated,
   warning:'Historical sessions that were never saved cannot be recovered by this audit. Game PIN records are deduplicated across sources.'},
  totals:{startedGamesWithRecords:started.length,studentEntriesRecorded:total(started.map(x=>x.entries)),
   confirmedWasteSorters:total(started.map(x=>x.sorters)),minimumRecordedActivePlays:total(started.map(x=>x.minimumActive)),
   teachersWithStartedGames:teacherIds.size,itemsSortedRecorded:total(started.map(x=>x.sortedItems)),
   gamesLackingIndividualSorting:started.filter(x=>!x.hasIndividualSorting).length,
   gamesWithoutActivityTracking:started.filter(x=>!x.activityTrackingComplete).length},
  ownedGames:all.filter(x=>x.teacherId===teacherId).map(({teacherId,...safe})=>safe),
  limitations:['Student entries are per session, not unique children','Minimum active plays are based on available gameplay or sorting evidence; zero does not mean no one played','Not every historic game or student action was saved','Only the signed-in teacher can see their own individual game records']
 };
}
module.exports={audit};
