// A development preview must not mix a running old renderer with new content.
export function createPreviewGuard({revision,baseUrl,fetcher=fetch,onUpdate=()=>{}}={}) {
  let outdated=false, pending;
  const enabled=/^[a-f0-9]{64}$/.test(revision || '');
  return {
    enabled,
    async check() {
      if (!enabled || outdated) return outdated;
      if (pending) return pending;
      pending=(async()=>{
        try {
          const response=await fetcher(new URL('preview-state.json',baseUrl),{cache:'no-store',signal:AbortSignal.timeout(4000)});
          if (!response.ok) return false;
          const state=await response.json();
          if (state.schemaVersion===1 && /^[a-f0-9]{64}$/.test(state.revision || '') && state.revision!==revision) {
            outdated=true;
            onUpdate();
          }
        } catch { /* Temporary rebuilds or offline use do not erase the open page. */ }
        return outdated;
      })();
      try {return await pending;} finally {pending=undefined;}
    }
  };
}
