import { afterEach, describe, expect, it, vi } from "vitest";
import { Autosave } from "./autosave";
afterEach(()=>vi.useRealTimers());
describe("autosave",()=>{
  it("batches keystrokes and acknowledges only server-confirmed versions",async()=>{
    vi.useFakeTimers();const write=vi.fn().mockResolvedValue({version:2});const save=new Autosave(1,write,()=>{});
    save.edit("a");save.edit("ab");save.edit("abc");expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(701);expect(write).toHaveBeenCalledExactlyOnceWith("abc",1);expect(save.status).toBe("saved");expect(save.version).toBe(2);save.dispose();
  });
  it("preserves newer local edits during an in-flight request",async()=>{
    vi.useFakeTimers();let done!:(v:{version:number})=>void;
    const write=vi.fn().mockImplementationOnce(()=>new Promise(r=>done=r)).mockResolvedValue({version:3});
    const save=new Autosave(1,write,()=>{});save.edit("first");const first=save.flush();save.edit("second");done({version:2});await first;
    await vi.advanceTimersByTimeAsync(701);expect(write).toHaveBeenLastCalledWith("second",2);expect(save.version).toBe(3);save.dispose();
  });
  it("stops on conflict without retrying or overwriting",async()=>{
    vi.useFakeTimers();const write=vi.fn().mockRejectedValue({status:409});const save=new Autosave(1,write,()=>{});
    save.edit("mine");await save.flush();save.edit("still mine");await vi.advanceTimersByTimeAsync(5000);
    expect(save.status).toBe("conflict");expect(write).toHaveBeenCalledTimes(1);expect(save.version).toBe(1);save.dispose();
  });
  it("retains failed data for explicit retry",async()=>{
    const write=vi.fn().mockRejectedValueOnce(new Error()).mockResolvedValue({version:2});const save=new Autosave(1,write,()=>{});
    save.edit("recover");await save.flush();expect(save.status).toBe("error");await save.flush();expect(write).toHaveBeenLastCalledWith("recover",1);expect(save.status).toBe("saved");save.dispose();
  });
});
