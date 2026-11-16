import {getScienceComments,writeScienceSocial} from "@/lib/science-social-server";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){return getScienceComments(request,(await params).id);}
export async function POST(request:Request,{params}:Context){return writeScienceSocial(request,(await params).id,"post");}
export async function PUT(request:Request,{params}:Context){return writeScienceSocial(request,(await params).id,"like");}
export async function DELETE(request:Request,{params}:Context){return writeScienceSocial(request,(await params).id,"delete");}
