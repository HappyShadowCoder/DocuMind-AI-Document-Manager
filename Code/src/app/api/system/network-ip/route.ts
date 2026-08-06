import { NextResponse } from "next/server";
import os from "os";

export async function GET() {
  const interfaces = os.networkInterfaces();
  let localIp = "";

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      // Skip non-IPv4 and internal (localhost) addresses
      if (net.family === "IPv4" && !net.internal) {
        localIp = net.address;
        break;
      }
    }
    if (localIp) break;
  }

  return NextResponse.json({ ip: localIp || "127.0.0.1" });
}