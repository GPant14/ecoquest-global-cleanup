const {Pool}=require('pg');
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('localhost')?false:{rejectUnauthorized:false}}):null;
let ready=false;
async function init(){if(!pool)return;await pool.query('CREATE TABLE IF NOT EXISTS ecoquest_homework (code VARCHAR(12) PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())');ready=true;}
async function save(game){if(!ready||game.mode!=='homework')return;const copy=JSON.parse(JSON.stringify(game,(k,v)=>k==='spawnTimer'?undefined:v));await pool.query('INSERT INTO ecoquest_homework(code,data,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(code) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()',[game.code,JSON.stringify(copy)]);}
async function restore(){if(!ready)return [];const res=await pool.query('SELECT data FROM ecoquest_homework');return res.rows.map(r=>r.data);}
module.exports={init,save,restore,isReady:()=>ready};
