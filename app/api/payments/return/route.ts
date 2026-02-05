import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return NextResponse.redirect(
    new URL("/account", req.url),
    { status: 303 }
  );
}

export async function GET(req: NextRequest) {
  return NextResponse.redirect(
    new URL("/account", req.url),
    { status: 303 }
  );
}
