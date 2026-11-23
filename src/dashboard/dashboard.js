
"use strict";
const $=(id)=>document.getElementById(id);
const page=document.body.dataset.page;
const state={csrf:"",workspace:"",workspaces:[],email:"",authenticated:false};
let busy=false;
const show=(id,yes)=>{const e=$(id);if(e)e.classList.toggle("hidden",!yes)};
const setText=(id,value)=>{const e=$(id);if(e)e.textContent=String(value??"â€”")};
const make=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=String(text??"");if(cls)el.className=cls;return el};
const time=(value)=>{if(!value)return "Not scheduled";const t=new Date(value);return Number.isFinite(t.getTime())?t.toLocaleString():"Unknown date"};
async function request(url,method="GET",data){
 const h={Accept:"application/json"};
 if(data!==undefined)h["content-type"]="application/json";
 if(state.csrf)h["x-csrf-token"]=state.csrf;
 if(state.workspace)h["x-workspace-id"]=state.workspace;
 const opts={method,credentials:"same-origin",headers:h,cache:"no-store"};
 if(data!==undefined)opts.body=JSON.stringify(data);
 const response=await fetch(url,opts);
 const result=await response.json().catch(()=>({error:"Unexpected server response"}));
 if(!response.ok)throw Object.assign(new Error(result.error||"Request failed"),{status:response.status});
 return result;
}
async function loadSession(){
 setText("headerStatus","Checking sessionâ€¦");
 try{
  const me=await request("/api/me");
  state.csrf=me.csrf||"";
  state.email=me.email||me.user?.email||"";
  state.workspaces=Array.isArray(me.workspaces)?me¶»§q«^