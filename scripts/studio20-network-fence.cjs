// Test process only. Test-specific fetch stubs may replace this; no real external traffic.
const fetch0=global.fetch;
global.fetch=(url,...args)=>{const u=new URL(String(url));if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw Error('STUDIO20_EXTERNAL_FETCH_FORBIDDEN');return fetch0(url,...args);};
