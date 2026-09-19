import {checkOrigin,HttpError,ownerId,routeError} from "@/lib/server";
import {disconnectItem} from "@/lib/plaid-service";
export async function POST(request:Request){try{checkOrigin(request);const owner=await ownerId();const payload=await request.json() as {itemId?:unknown};if(typeof payload.itemId!=="string"||payload.itemId.length>200)throw new HttpError("Invalid connection.");await disconnectItem(owner,payload.itemId);return Response.json({disconnected:true},{headers:{"Cache-Control":"no-store"}});}catch(e){return routeError(e);}}
