import { jwtVerify, SignJWT } from "jose";

export interface UserJwtPayload {
  id: string;
  email: string;
  role: string;
  must_change_password: boolean;
}

export function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set.");
  }
  return new TextEncoder().encode(secret);
}

export async function signJwt(payload: UserJwtPayload, remember: boolean): Promise<string> {
  const expirationTime = remember ? "30d" : "1d";
  
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expirationTime)
    .sign(getJwtSecretKey());
}

export async function verifyJwt(token: string): Promise<UserJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    return payload as unknown as UserJwtPayload;
  } catch (error) {
    return null;
  }
}