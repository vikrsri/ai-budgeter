// AES-GCM with a separate secret, random IV, and owner/item-bound authenticated data.
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function key(secret:string){const bytes=decode(secret);if(bytes.length!==32)throw Error("Invalid encryption configuration");return crypto.subtle.importKey("raw",bytes,"AES-GCM",false,["encrypt","decrypt"]);}
export async function encryptToken(token:string,secret:string,binding:string){const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(binding)},await key(secret),new TextEncoder().encode(token));return `v1.${encode(iv)}.${encode(new Uint8Array(cipher))}`;}
export async function decryptToken(value:string,secret:string,binding:string){const [version,iv,cipher]=value.split(".");if(version!=="v1"||!iv||!cipher)throw Error("Invalid encrypted token");const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(iv),additionalData:new TextEncoder().encode(binding)},await key(secret),decode(cipher));return new TextDecoder().decode(plain);}
