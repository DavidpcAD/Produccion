import { createHash } from 'crypto';
import { getDb, sql } from './db';
import type { Twilio } from 'twilio';

// Cliente Twilio perezoso: solo se crea si hay credenciales válidas.
// (Construirlo con SID indefinido lanza error al importar el módulo.)
let _client: Twilio | null = null;
function getTwilio(): Twilio | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !sid.startsWith('AC')) return null;
  if (!_client) {
    // import diferido para no cargar twilio si no se usa
    const twilio = require('twilio') as typeof import('twilio');
    _client = twilio(sid, token);
  }
  return _client;
}

// Fallback en memoria para desarrollo (cuando no existe la tabla OTPCodes).
const memStore = new Map<number, { hash: string; expiresAt: number }>();

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOTP(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export async function createAndSendOTP(idUsuario: number, telefono: string): Promise<void> {
  const code = generateOTP();
  const hash = hashOTP(code);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // 1) Persistir el OTP en dbo.OTPCodes (key por idUsuario); fallback a memoria.
  try {
    const db = await getDb();
    await db.request()
      .input('idUsuario', sql.Int, idUsuario)
      .input('hash', sql.NVarChar, hash)
      .input('expiresAt', sql.DateTime2, expiresAt)
      .query(`INSERT INTO dbo.OTPCodes (idUsuario, CodeHash, ExpiresAt) VALUES (@idUsuario, @hash, @expiresAt)`);
  } catch {
    memStore.set(idUsuario, { hash, expiresAt: expiresAt.getTime() });
  }

  // 2) Enviar por SMS si hay Twilio; si no, registrar en consola (dev).
  const client = getTwilio();
  const to = telefono.startsWith('+') ? telefono : `+506${telefono}`;
  if (client && process.env.TWILIO_PHONE_NUMBER && telefono) {
    await client.messages.create({
      body: `Tu código de acceso Adelante es: ${code}. Válido por 5 minutos.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
  } else {
    console.log(`[OTP dev] idUsuario=${idUsuario} código=${code} (Twilio no configurado)`);
  }
}

export async function verifyOTP(idUsuario: number, code: string): Promise<boolean> {
  // 1) Intentar contra dbo.OTPCodes
  try {
    const db = await getDb();
    const result = await db.request()
      .input('idUsuario', sql.Int, idUsuario)
      .input('now', sql.DateTime2, new Date())
      .query(`
        SELECT TOP 1 IDOtp, CodeHash
        FROM dbo.OTPCodes
        WHERE idUsuario = @idUsuario AND ExpiresAt > @now AND Usado = 0
        ORDER BY FechaCreacion DESC
      `);
    if (result.recordset.length) {
      const { IDOtp, CodeHash } = result.recordset[0];
      const valid = hashOTP(code) === CodeHash;
      if (valid) {
        await db.request().input('idOtp', sql.Int, IDOtp)
          .query(`UPDATE dbo.OTPCodes SET Usado = 1 WHERE IDOtp = @idOtp`);
      }
      return valid;
    }
  } catch {
    /* tabla no disponible -> fallback en memoria */
  }

  // 2) Fallback en memoria (dev)
  const entry = memStore.get(idUsuario);
  if (entry && entry.expiresAt > Date.now() && entry.hash === hashOTP(code)) {
    memStore.delete(idUsuario);
    return true;
  }
  return false;
}
