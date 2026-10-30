const storage=require('./homework-storage');
let ready=false;
const lastSaved=new Map();
function build(game){
 const active=game.teams.filter(team=>team.players.length).slice().sort((a,b)=>b.score-a.score||a.id-b.id);
 let prior=null,rank=0;
 const teams=active.map((team,i)=>{
  if(prior!==team.score){rank=i+1;prior=team.score}
  return {rank,teamId:team.id,name:team.name,score:team.score,
   itemsSorted:team.items.filter(item=>item.picked).length,
   players:team.players.map(player=>({
    nickname:player.name,avatar:player.avatar||'neutral',
    contributionPoints:Number.isFinite(player.pointsEarned)?player.pointsEarned:null,
    itemsSorted:Number.isFinite(player.itemsSorted)?player.itemsSorted:null
   }))
  }
 });
 return {version:1,gameCode:game.code,mode:game.mode||'live',format:game.format||'teams',
  country:game.country,arena:game.arena,status:game.status,
  createdAt:game.createdAt||null,startedAt:game.startedAt||null,
  endsAt:game.endsAt||null,finishedAt:game.finishedAt||null,
  savedAt:new Date().toISOString(),
  playerCount:teams.reduce((n,team)=>n+team.players.length,0),
  playedCount:teams.reduce((n,team)=>n+team.players.filter(p=>p.played===true||Number(p.itemsSorted)>0).length,0),teams
 }
}
async function init(){
 if(!storage.isReady())return;
 await storage.query('CREATE TABLE IF NOT EXISTS ecoquest_game_reports (code VARCHAR(12) PRIMARY KEY, teacher_id INTEGER NOT NULL, report JSONB NOT NULL, captured_ms BIGINT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 ready=true;
}
async function save(game){
 if(!ready||!Number.isInteger(game.teacherId))return false;
 const report=build(game),captured=Date.now();
 await storage.query('INSERT INTO ecoquest_game_reports(code,teacher_id,report,captured_ms,updated_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT (code) DO UPDATE SET report=EXCLUDED.report,captured_ms=EXCLUDED.captured_ms,updated_at=NOW() WHERE ecoquest_game_reports.teacher_id=EXCLUDED.teacher_id AND ecoquest_game_reports.captured_ms<=EXCLUDED.captured_ms',[game.code,game.teacherId,JSON.stringify(report),captured]);
 return true;
}
function schedule(game,force=false){
 if(!ready||!game?.teacherId)return;
 const now=Date.now(),last=lastSaved.get(game.code)||0;
 if(!force&&now-last<20000)return;
 lastSaved.set(game.code,now);
 save(game).catch(e=>console.error('Game report save failed:',e.message));
}
async function list(teacherId){
 if(!ready)return[];
 const result=await storage.query('SELECT report FROM ecoquest_game_reports WHERE teacher_id=$1 ORDER BY updated_at DESC LIMIT 100',[teacherId]);
 return result.rows.map(row=>{const r=row.report;return {gameCode:r.gameCode,mode:r.mode,format:r.format,status:r.status,createdAt:r.createdAt,startedAt:r.startedAt,finishedAt:r.finishedAt,playerCount:r.playerCount,teams:r.teams?.length||0,topScore:r.teams?.[0]?.score||0}})
}

async function impact(teacherId=null){
 if(!ready)throw Error('Impact metrics are not available');
 const args=[],filter=teacherId===null?'':'WHERE teacher_id=$1';
 if(teacherId!==null)args.push(teacherId);
 const sql=`SELECT
 COUNT(*) FILTER (WHERE COALESCE((report->>'startedAt')::bigint,0)>0)::integer AS sessions_hosted,
 COUNT(DISTINCT teacher_id) FILTER (WHERE COALESCE((report->>'startedAt')::bigint,0)>0)::integer AS teachers_hosted,
 COALESCE(SUM(CASE WHEN COALESCE((report->>'startedAt')::bigint,0)>0 THEN COALESCE((report->>'playerCount')::integer,0) ELSE 0 END),0)::integer AS student_entries,
 COALESCE(SUM(CASE WHEN COALESCE((report->>'startedAt')::bigint,0)>0 THEN COALESCE((report->>'playedCount')::integer,0) ELSE 0 END),0)::integer AS active_plays
 FROM ecoquest_game_reports ${filter}`;
 const row=(await storage.query(sql,args)).rows[0];
 return {sessionsHosted:row.sessions_hosted,teachersHosted:row.teachers_hosted,studentEntries:row.student_entries,activePlays:row.active_plays,
  note:'Counts represent sessions and participations, not unique people. Historical active-play data may be incomplete.'};
}
async function get(teacherId,code){
 if(!ready)return null;
 const result=await storage.query('SELECT report FROM ecoquest_game_reports WHERE teacher_id=$1 AND code=$2',[teacherId,code]);
 return result.rows[0]?.report||null;
}
module.exports={init,save,schedule,list,get,build,impact,isReady:()=>ready};
