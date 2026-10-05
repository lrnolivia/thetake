import {createRemoteJWKSet,jwtVerify} from 'jose';
const sets=new Map();
export async function authenticate(request,env,mode){
 const issuer=env.ACCESS_ISSUER,audience=mode==='test'?env.TEST_ACCESS_AUD:env.LIVE_ACCESS_AUD;
 if(!issuer||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||!audience)throw Object.assign(Error('Sign-in is not configured'),{status:503});
 const token=request.headers.get('Cf-Access-Jwt-Assertion');if(!token)throw Object.assign(Error('Sign in with Google to continue'),{status:401});
 let keys=sets.get(issuer);if(!keys){keys=createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'));sets.set(issuer,keys)}
 try{const payload=await verifyAccessToken(token,keys,{issuer,audience});
 const email=String(payload.email).toLowerCase(),expected=mode==='test'?env.MAINTAINER_EMAIL:env.INVENTORY_OWNER_EMAIL;
 if(!expected||email!==expected.toLowerCase()||typeof payload.sub!=='string'||!payload.sub)throw Error('Wrong inventory account');
 return {id:payload.sub,email,role:mode==='test'?'maintenance':'owner'};
 }catch{throw Object.assign(Error('This account cannot access this inventory space'),{status:403})}
}

export async function verifyAccessToken(token,keys,{issuer,audience}){const {payload}=await jwtVerify(token,keys,{issuer,audience,algorithms:['RS256'],requiredClaims:['sub','email','iat','exp'],clockTolerance:5});return payload}
