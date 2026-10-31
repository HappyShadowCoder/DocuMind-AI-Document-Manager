import { NextResponse } from "next/server";
import os from "os";

export async function GET() {
  const interfaces = os.networkInterfaces();
  const candidates: { name: string; ip: string; priority: number }[] = [];

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();

    // Skip virtual, docker, tunnel, or loopback interfaces
    const isVirtual =
      lowerName.startsWith("utun") ||
      lowerName.startsWith("docker") ||
      lowerName.startsWith("vbox") ||
      lowerName.startsWith("vmnet") ||
      lowerName.startsWith("veth") ||
      lowerName.startsWith("bridge") ||
      lowerName.startsWith("awdl") ||
      lowerName.startsWith("llw") ||
      lowerName.startsWith("lo");

    for (const net of interfaces[name] || []) {
      if (net.family === "IPv4" && !net.internal && net.address !== "127.0.0.1") {
        let priority = 10;
        // Prioritize Wi-Fi and primary Ethernet interfaces (en0, en1, wlan0, eth0)
        if (lowerName === "en0" || lowerName === "wlan0" || lowerName === "wi-fi") {
          priority = 100;
        } else if (lowerName === "en1" || lowerName === "eth0" || lowerName === "ethernet") {
          priority = 90;
        } else if (isVirtual) {
          priority = 1;
        }

        // Give boost to standard home/office LAN IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        if (
          net.address.startsWith("192.168.") ||
          net.address.startsWith("10.") ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(net.address)
        ) {
          priority += 5;
        }

        candidates.push({ name, ip: net.address, priority });
      }
    }
  }

  // Sort candidates by highest priority first
  candidates.sort((a, b) => b.priority - a.priority);

  const primaryIp = candidates[0]?.ip || "127.0.0.1";
  const allIps = candidates.map((c) => ({ name: c.name, ip: c.ip }));

  return NextResponse.json({ ip: primaryIp, allIps });
}