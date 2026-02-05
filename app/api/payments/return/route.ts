import { NextRequest, NextResponse } from "next/server";

const DOMAIN = "https://www.vilna.pro";

export async function GET(_req: NextRequest) {
  return NextResponse.redirect(`${DOMAIN}/account`, { status: 303 });
}

export async function POST(_req: NextRequest) {
  return NextResponse.redirect(`${DOMAIN}/account`, { status: 303 });
}
