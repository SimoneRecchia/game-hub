import { describe, expect, it } from 'vitest'
import {
  base64url,
  chiavePubblicaValida,
  cifra,
  daBase64url,
  endpointValido,
  firmaVapid,
  nuoveChiaviVapid,
  richiestaPush,
  segretoValido,
} from '../webpush'

describe('la cifratura delle notifiche', () => {
  it('e\' quella dell\'esempio di RFC 8291, byte per byte', async () => {
    // RFC 8291, sezione 5: le chiavi, la sale e il messaggio dell'esempio, e il corpo che ne viene.
    const corpo = await cifra(
      {
        p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
        auth: 'BTBZMqHH6r4Tts7J_aSIgg',
      },
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      {
        sale: daBase64url('DGv6ra1nlYgDCS1FRnbzlw'),
        privata: daBase64url('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
        pubblica: daBase64url(
          'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
        ),
      },
    )
    expect(base64url(corpo)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    )
  })

  it('la firma e\' un JWT ES256 che la chiave pubblica verifica, per l\'origine del servizio', async () => {
    const chiavi = await nuoveChiaviVapid()
    expect(chiavePubblicaValida(chiavi.pubblica)).toBe(true)
    const jwt = await firmaVapid('https://fcm.googleapis.com', chiavi, 'https://giochi.example.com', 1_700_000_000_000)
    const [testa, corpo, firma] = jwt.split('.')
    expect(JSON.parse(new TextDecoder().decode(daBase64url(testa)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(daBase64url(corpo)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 1_700_000_000 + 12 * 3600,
      sub: 'https://giochi.example.com',
    })
    const pubblica = await crypto.subtle.importKey(
      'raw',
      daBase64url(chiavi.pubblica),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    const valida = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pubblica,
      daBase64url(firma),
      new TextEncoder().encode(`${testa}.${corpo}`),
    )
    expect(valida).toBe(true)
  })

  it('la richiesta ha le intestazioni del protocollo, e il corpo cambia a ogni messaggio', async () => {
    const chiavi = await nuoveChiaviVapid()
    const telefono = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    const iscrizione = {
      endpoint: 'https://web.push.apple.com/abc',
      p256dh: base64url(new Uint8Array(await crypto.subtle.exportKey('raw', telefono.publicKey))),
      auth: base64url(crypto.getRandomValues(new Uint8Array(16))),
    }
    const messaggio = { titolo: 'Prova', testo: 'Ciao', url: '/' }
    const a = await richiestaPush(iscrizione, messaggio, chiavi, { sub: 'https://giochi.example.com' })
    const b = await richiestaPush(iscrizione, messaggio, chiavi, { sub: 'https://giochi.example.com' })
    const h = a.init.headers as Record<string, string>
    expect(h['Content-Encoding']).toBe('aes128gcm')
    expect(h.TTL).toBe('3600')
    expect(h.Authorization).toMatch(new RegExp(`^vapid t=[^,]+, k=${chiavi.pubblica}$`))
    expect(base64url(a.init.body as Uint8Array)).not.toBe(base64url(b.init.body as Uint8Array))
  })

  it('riconosce le iscrizioni che non vanno', () => {
    expect(endpointValido('https://fcm.googleapis.com/fcm/send/x')).toBe(true)
    expect(endpointValido('http://fcm.googleapis.com/x')).toBe(false)
    expect(endpointValido('javascript:alert(1)')).toBe(false)
    expect(segretoValido('BTBZMqHH6r4Tts7J_aSIgg')).toBe(true)
    expect(segretoValido('corto')).toBe(false)
    expect(chiavePubblicaValida('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4')).toBe(true)
    expect(chiavePubblicaValida('BTBZMqHH6r4Tts7J_aSIgg')).toBe(false)
  })
})
