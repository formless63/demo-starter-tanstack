// Disposable fixture only: pause outside the committed application transaction, before native queue acknowledgement.
import { startJobsWorker } from '../src/integrations/jobs/worker.server';
await startJobsWorker({execute:async(job,handler)=>{
 const result=await handler();
 if(job.name==='import-export.run'){
  console.info(JSON.stringify({event:'fixture.transfer_committed_waiting_ack'}));
  await new Promise<never>(()=>{});
 }
 return result;
}});
