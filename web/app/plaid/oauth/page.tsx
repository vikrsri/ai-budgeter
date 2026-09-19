import {requireChatGPTUser} from "@/app/chatgpt-auth";
import OAuthReturn from "@/components/plaid-oauth";
export const dynamic="force-dynamic";
async function SignedIn({returnTo}:{returnTo:string}){await requireChatGPTUser(returnTo);return <OAuthReturn/>;}
export default async function OAuthPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams;const state=typeof params.oauth_state_id==="string"?params.oauth_state_id:"";return <SignedIn returnTo={`/plaid/oauth${state?`?oauth_state_id=${encodeURIComponent(state)}`:""}`}/>;}
