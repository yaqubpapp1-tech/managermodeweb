import { DurableObject } from "cloudflare:workers";

const CLUBS = ['Barcelona','Real Madrid','Manchester City','Liverpool','Arsenal','Bayern Munich','Paris Saint-Germain','Inter','AC Milan','Juventus','Chelsea','Atlético Madrid'];
const PLAYERS = [
  ['Alexia Putellas','Barcelona'],['Erling Haaland','Manchester City'],['Kylian Mbappé','Real Madrid'],['Thibaut Courtois','Real Madrid'],['Pedri','Barcelona'],['Lamine Yamal','Barcelona'],['Rodri','Manchester City'],['Harry Kane','Bayern Munich'],['Ousmane Dembélé','Paris Saint-Germain'],['Jude Bellingham','Real Madrid'],['Khadija Shaw','Manchester City'],['Michael Olise','Bayern Munich'],['Aitana Bonmatí','Barcelona'],['Vitinha','Paris Saint-Germain'],['Bruno Fernandes','Manchester City'],['Gabriel','Arsenal'],['Gianluigi Donnarumma','Paris Saint-Germain'],['Temwa Chawinga','Arsenal'],['Mariona','Barcelona'],['Claudia Pina','Barcelona'],['Caroline Graham Hansen','Barcelona'],['Mohamed Salah','Liverpool'],['Vini Jr.','Real Madrid'],['Nuno Mendes','Paris Saint-Germain'],['Willian Pacho','Paris Saint-Germain'],['Ewa Pajor','Barcelona'],['Khvicha Kvaratskhelia','Paris Saint-Germain'],['Alisson','Liverpool'],['Federico Valverde','Real Madrid'],['Declan Rice','Arsenal'],['Virgil van Dijk','Liverpool'],['Mapi León','Barcelona'],['Sophia Wilson','Arsenal'],['William Saliba','Arsenal'],['Florian Wirtz','Bayern Munich'],['Christiane Endler','Barcelona'],['Melchie Dumornay','Chelsea'],['Achraf Hakimi','Paris Saint-Germain'],['Alessia Russo','Arsenal'],['Jan Oblak','Atlético Madrid'],['João Neves','Paris Saint-Germain'],['Luis Díaz','Liverpool'],['Yui Hasegawa','Manchester City'],['Klara Bühl','Bayern Munich'],['Barbra Banda','Real Madrid'],['Patri Guijarro','Barcelona'],['Joshua Kimmich','Bayern Munich'],['Robert Lewandowski','Barcelona'],['Lautaro Martínez','Inter'],['Alexander Isak','Arsenal'],['Marie Katoto','Chelsea'],['Yann Sommer','Inter'],['David Raya','Arsenal'],['Raphinha','Barcelona'],['Jamal Musiala','Bayern Munich'],['Sakina Karchaoui','Paris Saint-Germain'],['Mike Maignan','AC Milan'],['Vivianne Miedema','Manchester City'],['Ona Batlle','Barcelona'],['Bukayo Saka','Arsenal'],['Irene Paredes','Barcelona'],['Hannah Hampton','Chelsea'],['Kadidiatou Diani','Paris Saint-Germain'],['Ann-Katrin Berger','Chelsea'],['Pernille Harder','Bayern Munich'],['Lauren Hemp','Manchester City'],['Rose Lavelle','Inter'],['Debinha','Manchester City'],['Viktor Gyökeres','Arsenal'],['Cole Palmer','Chelsea'],['Martin Ødegaard','Arsenal'],['Guro Reiten','Chelsea'],['Nicolò Barella','Inter'],['Sam Kerr','Chelsea'],['Marc-André ter Stegen','Barcelona'],['Serhou Guirassy','AC Milan'],['Lindsey Heaps','Inter'],['Ada Hegerberg','Barcelona'],['Marquinhos','Paris Saint-Germain'],['Victor Osimhen','Chelsea'],['Gregor Kobel','Bayern Munich'],['Jonathan Tah','Bayern Munich'],['Julián Alvarez','Atlético Madrid'],['Kevin De Bruyne','Manchester City'],['Alexis Mac Allister','Liverpool'],['Leah Williamson','Arsenal'],['Frenkie de Jong','Barcelona'],['Millie Bright','Chelsea'],['Alessandro Bastoni','Inter'],['De Gea','Inter'],['Ibrahima Konaté','Liverpool'],['Emiliano Martínez','Arsenal'],['Moisés Caicedo','Chelsea'],['Lea Schüller','Bayern Munich']
];
const cookies = { session: 'mc_session', club: 'mc_club' };
const json = (data, init={}) => new Response(JSON.stringify(data), { ...init, headers: { 'Content-Type':'application/json', ...(init.headers||{}) }});
const randomToken = () => crypto.randomUUID() + crypto.randomUUID().replaceAll('-','');
async function hashPassword(password, saltBytes = crypto.getRandomValues(new Uint8Array(16))) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt:saltBytes, iterations:120000, hash:'SHA-256'}, key, 256);
  return { salt: btoa(String.fromCharCode(...saltBytes)), hash: btoa(String.fromCharCode(...new Uint8Array(bits))) };
}
async function verifyPassword(password, record) {
  const salt = Uint8Array.from(atob(record.salt), c => c.charCodeAt(0));
  return (await hashPassword(password, salt)).hash === record.hash;
}
function parseCookies(request){
  const out={};
  for(const part of (request.headers.get('Cookie')||'').split(';')){ const i=part.indexOf('='); if(i>0) out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1)); }
  return out;
}
function cookie(name,value,maxAge=2592000){ return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Secure`; }
function clubStub(env, club){ return env.CLUBS.getByName(club); }

export class ClubRoom extends DurableObject {
  constructor(ctx, env){
    super(ctx, env); this.ctx=ctx;
    ctx.blockConcurrencyWhile(async()=>{ ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, data TEXT NOT NULL);`); });
  }
  _get(key){ const row=this.ctx.storage.sql.exec('SELECT value FROM meta WHERE key=?', key).one(); return row?.value ?? null; }
  _set(key,value){ this.ctx.storage.sql.exec('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value); }
  async publicState(){ const owner=this._get('owner'); return {taken:!!owner, owner:owner?JSON.parse(owner):null, day:Number(this._get('day')||1)}; }
  async claim(name,age,password){ if(this._get('owner')) return {ok:false,error:'Club already taken'}; const auth=await hashPassword(password), session=randomToken(); this._set('auth',JSON.stringify(auth)); this._set('owner',JSON.stringify({name,age:Number(age)})); this._set('session',session); this._set('day','1'); return {ok:true,session}; }
  async login(name,password){ const owner=this._get('owner'), auth=this._get('auth'); if(!owner||!auth)return {ok:false,error:'Club is not claimed yet'}; const o=JSON.parse(owner); if(o.name!==name)return {ok:false,error:'Manager name does not match this club'}; if(!(await verifyPassword(password,JSON.parse(auth))))return {ok:false,error:'Wrong password'}; const session=randomToken(); this._set('session',session); return {ok:true,session}; }
  async auth(session){ return !!this._get('owner') && !!session && session===this._get('session'); }
  async notifications(session){ if(!(await this.auth(session)))return {ok:false,error:'Not signed in'}; return {ok:true,items:this.ctx.storage.sql.exec('SELECT data FROM notifications ORDER BY rowid DESC LIMIT 30').toArray().map(r=>JSON.parse(r.data))}; }
  async markNotificationsRead(session){ if(!(await this.auth(session)))return {ok:false,error:'Not signed in'}; this.ctx.storage.sql.exec('DELETE FROM notifications'); return {ok:true}; }
  async addNotification(n){ this.ctx.storage.sql.exec('INSERT OR REPLACE INTO notifications(id,data) VALUES(?,?)',n.id,JSON.stringify(n)); return {ok:true}; }
  async listOffers(session){ if(!(await this.auth(session)))return {ok:false,error:'Not signed in'}; return {ok:true,items:this.ctx.storage.sql.exec('SELECT data FROM offers ORDER BY rowid DESC LIMIT 60').toArray().map(r=>JSON.parse(r.data))}; }
  async addOffer(o){ this.ctx.storage.sql.exec('INSERT OR REPLACE INTO offers(id,data) VALUES(?,?)',o.id,JSON.stringify(o)); return {ok:true}; }
  async updateOffer(session,id,patch){ if(!(await this.auth(session)))return {ok:false,error:'Not signed in'}; const row=this.ctx.storage.sql.exec('SELECT data FROM offers WHERE id=?',id).one(); if(!row)return {ok:false,error:'Offer not found'}; const data={...JSON.parse(row.data),...patch}; this.ctx.storage.sql.exec('UPDATE offers SET data=? WHERE id=?',JSON.stringify(data),id); return {ok:true,item:data}; }
  async advanceDay(session){ if(!(await this.auth(session)))return {ok:false,error:'Not signed in'}; const day=Number(this._get('day')||1)+1; this._set('day',String(day)); return {ok:true,day}; }
}

async function ensureClubList(env){ return Promise.all(CLUBS.map(async club=>({club,...await clubStub(env,club).publicState()}))); }
async function requireAuth(request,env){ const c=parseCookies(request), club=c[cookies.club], session=c[cookies.session]; if(!club||!session||!CLUBS.includes(club))return null; return await clubStub(env,club).auth(session)?{club,session}:null; }

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    try{
      if(url.pathname.startsWith('/api/')){
        if(url.pathname==='/api/clubs'&&request.method==='GET')return json(await ensureClubList(env));
        if(url.pathname==='/api/club/claim'&&request.method==='POST'){
          const b=await request.json(); if(!CLUBS.includes(b.club)||!b.name||!b.password||String(b.password).length<4)return json({ok:false,error:'Club, manager name and a 4+ character password are required'},{status:400});
          const r=await clubStub(env,b.club).claim(b.name,b.age,b.password); if(!r.ok)return json(r,{status:409});
          return json({ok:true,club:b.club},{headers:{'Set-Cookie':`${cookie(cookies.session,r.session)}, ${cookie(cookies.club,b.club)}`}});
        }
        if(url.pathname==='/api/club/login'&&request.method==='POST'){
          const b=await request.json(), r=await clubStub(env,b.club).login(b.name,b.password); if(!r.ok)return json(r,{status:401});
          return json({ok:true,club:b.club},{headers:{'Set-Cookie':`${cookie(cookies.session,r.session)}, ${cookie(cookies.club,b.club)}`}});
        }
        const auth=await requireAuth(request,env); if(!auth)return json({ok:false,error:'Sign in to a club first'},{status:401});
        const stub=clubStub(env,auth.club);
        if(url.pathname==='/api/me')return json({ok:true,club:auth.club,state:await stub.publicState()});
        if(url.pathname==='/api/notifications')return json(await stub.notifications(auth.session));
        if(url.pathname==='/api/notifications/read'&&request.method==='POST')return json(await stub.markNotificationsRead(auth.session));
        if(url.pathname==='/api/offers'&&request.method==='GET')return json(await stub.listOffers(auth.session));
        if(url.pathname==='/api/day'&&request.method==='POST'){
          const r=await stub.advanceDay(auth.session); if(!r.ok)return json(r,{status:401});
          const owned=PLAYERS.filter(([,team])=>team===auth.club), sources=CLUBS.filter(c=>c!==auth.club).sort(()=>Math.random()-0.5).slice(0,3), incoming=[];
          for(let i=0;i<Math.min(3,owned.length);i++){
            const player=owned[(r.day+i)%owned.length][0], from=sources[i%sources.length], fee=Math.round((55+Math.random()*55)*10)/10;
            const offer={id:randomToken(),type:'incoming',player,fromClub:from,toClub:auth.club,fee,status:'pending',day:r.day}; await stub.addOffer(offer); await stub.addNotification({id:offer.id,type:'offer',title:'Transfer offer received',message:`${from} offered $${fee}M for ${player}.`,offerId:offer.id,createdAt:Date.now()}); incoming.push(offer);
          }
          return json({ok:true,day:r.day,incoming});
        }
        if(url.pathname==='/api/offers/send'&&request.method==='POST'){
          const b=await request.json(), fee=Number(b.fee); if(!b.player||!CLUBS.includes(b.toClub)||b.toClub===auth.club||!Number.isFinite(fee)||fee<=0)return json({ok:false,error:'Choose a player, another club and a valid fee'},{status:400});
          const target=clubStub(env,b.toClub), ts=await target.publicState(), offer={id:randomToken(),type:'outgoing',player:b.player,fromClub:auth.club,toClub:b.toClub,fee,status:'pending',day:Number((await stub.publicState()).day||1)};
          if(ts.taken){ await target.addOffer(offer); await target.addNotification({id:offer.id,type:'offer',title:'New transfer offer',message:`${auth.club} offered $${fee}M for ${b.player}.`,offerId:offer.id,createdAt:Date.now()}); await stub.addOffer(offer); return json({ok:true,offer,realPlayer:true}); }
          const counter=Math.round(Math.max(20,fee*1.12)*10)/10, accepted=fee>=counter*0.92, response={...offer,status:accepted?'accepted':'counter',counterFee:accepted?fee:counter}; await stub.addOffer(response); return json({ok:true,offer:response,realPlayer:false});
        }
        if(url.pathname==='/api/offers/respond'&&request.method==='POST'){
          const b=await request.json(), list=await stub.listOffers(auth.session), row=list.items.find(x=>x.id===b.id); if(!row)return json({ok:false,error:'Offer not found'},{status:404});
          const action=b.action; if(!['accept','reject','counter'].includes(action))return json({ok:false,error:'Invalid response'},{status:400});
          const patch={status:action==='counter'?'countered':action}; if(action==='counter')patch.counterFee=Number(b.counterFee||row.fee); const r=await stub.updateOffer(auth.session,b.id,patch); if(!r.ok)return json(r,{status:400});
          if(row.fromClub&&row.fromClub!==auth.club){ const sender=clubStub(env,row.fromClub), msg=action==='counter'?`countered your offer for ${row.player} at $${patch.counterFee}M`:`${action}ed your offer for ${row.player}`; await sender.addOffer({...row,...patch}); await sender.addNotification({id:randomToken(),type:'offer-response',title:'Negotiation update',message:`${auth.club} ${msg}.`,offerId:row.id,createdAt:Date.now()}); }
          return json(r);
        }
        return json({ok:false,error:'Not found'},{status:404});
      }
      const asset=await env.ASSETS.fetch(request); if(url.pathname==='/'||url.pathname==='/index.html'){const html=await asset.text();return new Response(html.replace('</body>','<script src="/multiplayer.js"></script></body>'),{status:asset.status,headers:{...asset.headers,'Content-Type':'text/html; charset=UTF-8','Cache-Control':'no-store'}});} return asset;
    }catch(e){return json({ok:false,error:String(e?.message||e)},{status:500});}
  }
};
