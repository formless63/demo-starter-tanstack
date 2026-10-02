import { useEffect, useRef, useState } from 'react';
import { FlowCanvas } from '../src/integrations/flow-canvas/FlowCanvas';
import { validateGraph, type GraphDocument } from '../src/integrations/flow-canvas/graph';
export const sampleGraph:GraphDocument = {schemaVersion:1,nodes:[{id:'start',kind:'default',label:'Start',position:{x:40,y:40}},{id:'finish',kind:'default',label:'Finish 😀 café',position:{x:240,y:160}}],edges:[]};
const secondGraph:GraphDocument={schemaVersion:1,nodes:[{id:'other',kind:'default',label:'Other record',position:{x:80,y:80}}],edges:[]};
export type FlowPersistence = {save:(key:string,graph:GraphDocument)=>Promise<void>;load:(key:string)=>Promise<GraphDocument>};
const immediate:FlowPersistence={save:async()=>{},load:async key=>key==='alpha'?sampleGraph:secondGraph};
/** Synthetic application fixture, not module persistence or production authorization. */
export function FlowExample({persistence=immediate}:{persistence?:FlowPersistence}) {
 const [value,setValue]=useState(sampleGraph);
 const [other,setOther]=useState(sampleGraph);
 const [key,setKey]=useState('alpha');
 const [generation,setGeneration]=useState(0);
 const [readOnly,setReadOnly]=useState(false);
 const [reject,setReject]=useState(false);
 const [visible,setVisible]=useState(true);
 const [dirty,setDirty]=useState(false);
 const [saving,setSaving]=useState(false);
 const [status,setStatus]=useState('Not saved');
 const [deferred,setDeferred]=useState(false);
 const revision=useRef(0);
 const identity=useRef(0);
 const request=useRef(0);
 const mounted=useRef(false);
 const busy=useRef(false);
 const pending=useRef<{resolve:()=>void;reject:()=>void}[]>([]);
 const [calls,setCalls]=useState(0);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;identity.current++;request.current++;};},[]);
 function cancel() {request.current++;busy.current=false;setSaving(false);setStatus('Cancelled; unsaved edits retained');}
 function change(next:GraphDocument) {if(reject||readOnly)return;revision.current++;setValue(next);setDirty(true);if(!saving)setStatus("Unsaved changes");}
 async function save() {
  if(busy.current||!dirty)return;
  busy.current=true;setSaving(true);setCalls(n=>n+1);setStatus('Saving');
  const token=++request.current;const record=identity.current;const edit=revision.current;
   try {
   const snapshot=validateGraph(value);
   if(deferred)await new Promise<void>((resolve,rejectPromise)=>{pending.current.push({resolve,reject:()=>rejectPromise(new Error('fixture failure'))});});
   if(!mounted.current||token!==request.current||record!==identity.current)return;
   await persistence.save(key,snapshot);
   if(!mounted.current||token!==request.current||record!==identity.current)return;
   if(edit===revision.current){setDirty(false);setStatus('Saved');}else setStatus('Earlier revision saved; newer edits remain unsaved');
  }catch {if(mounted.current&&token===request.current&&record===identity.current)setStatus('Save failed; unsaved edits retained');}
  finally {if(mounted.current&&token===request.current&&record===identity.current){busy.current=false;setSaving(false);}}
 }
 async function switchRecord() {
  const next=key==='alpha'?'beta':'alpha';const record=++identity.current;const token=++request.current;
  busy.current=false;setSaving(false);setDirty(false);setKey(next);setGeneration(n=>n+1);setValue(next==='alpha'?sampleGraph:secondGraph);setStatus('Loading');revision.current++;
  const edit=revision.current;
  try {
   if(deferred)await new Promise<void>((resolve,rejectPromise)=>{pending.current.push({resolve,reject:()=>rejectPromise(new Error('fixture failure'))});});
   if(!mounted.current||record!==identity.current||token!==request.current||edit!==revision.current)return;
   const loaded=await persistence.load(next);
   if(!mounted.current||record!==identity.current||token!==request.current||edit!==revision.current)return;
   setValue(loaded);setStatus('Loaded');
  }catch {if(mounted.current&&record===identity.current&&token===request.current)setStatus('Load failed');}
 }
 return <main><h1>Flow Canvas reference</h1>
  <p>Public synthetic graphs; memory-only application fixture. No data is stored remotely.</p>
  <label><input type="checkbox" checked={readOnly} onChange={e=>setReadOnly(e.target.checked)}/>Read only</label>
  <label><input type="checkbox" checked={reject} onChange={e=>setReject(e.target.checked)}/>Reject proposals</label>
  <label><input type="checkbox" checked={deferred} onChange={e=>setDeferred(e.target.checked)}/>Defer persistence</label>
  <button type="button" onClick={()=>void switchRecord()}>Switch record</button>
  <button type="button" onClick={()=>{identity.current++;request.current++;busy.current=false;setSaving(false);setGeneration(n=>n+1);setValue({...sampleGraph,nodes:sampleGraph.nodes.map((node,index)=>({...node,id:index===0?'quoted"[id]\\n':'__proto__'}))});setDirty(true);revision.current++;setStatus('Imported synthetic IDs');}}>Load hostile IDs</button>
  <button type="button" onClick={()=>{identity.current++;request.current++;busy.current=false;setSaving(false);setStatus("Editor toggled; pending request cancelled");setVisible(v=>!v);setGeneration(n=>n+1);}}>Toggle editor</button>
  <button type="button" disabled={saving||!dirty} onClick={()=>void save()}>Save graph</button>
  <button type="button" onClick={cancel}>Cancel request</button>
  <button type="button" onClick={()=>{pending.current.shift()?.resolve();}}>Resolve request</button>
  <button type="button" onClick={()=>{pending.current.shift()?.reject();}}>Reject request</button>
  <p role="status" aria-label="Persistence status">{status}</p><p data-testid="dirty">{dirty?'Unsaved changes':'Clean'}</p><p data-testid="save-calls">Save calls: {calls}</p>
  {visible?<FlowCanvas documentKey={`${key}:${generation}`} value={value} onChange={change} label="Primary graph" readOnly={readOnly}/>:null}
  <FlowCanvas documentKey="independent" value={other} onChange={setOther} label="Independent graph"/>
  <output data-testid="graph-json">{JSON.stringify(value)}</output>
 </main>;
}
