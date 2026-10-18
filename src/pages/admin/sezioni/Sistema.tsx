import { useEffect, useRef, useState } from 'react'
import type { AdminIo, AdminSistema } from '@shared/admin'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { IconChevronRight } from '@/components/Icons'
import { formatCountdown } from '@/lib/format'
import { useAdmin, useAzione, useCambiaIo, useIo } from '../dati'
import { dataOra, durata, giornoIntero, numero, oraPrecisa } from '../formato'
import { Carta, Stato, type Tono } from '../pezzi'
import { ConDati, Schermata, aggiornaDa } from '../Schermata'

const TONO: Record<AdminSistema['configurazione'][number]['stato'], Tono> = {
  ok: 'buono',
  avviso: 'avviso',
  spento: 'neutro',
}

const PAROLA: Record<AdminSistema['configurazione'][number]['stato'], string> = {
  ok: 'Ok',
  avviso: 'Da guardare',
  spento: 'Spento',
}

/**
 * Il sistema: l'ora del server e la giornata di gioco, la configurazione —
 * la posta, il cookie, le chiavi di Cloudflare e delle notifiche — chi
 * amministra, e il bottone per richiudere il pannello su questo dispositivo.
 */
export default function Sistema() {
  const d = useAdmin<AdminSistema>('/sistema')
  return (
    <Schermata titolo="Sistema" aggiorna={aggiornaDa(d)}>
      <ConDati d={d}>{(s) => <Contenuto s={s} arrivato={d.quando ?? Date.now()} />}</ConDati>
    </Schermata>
  )
}

function Contenuto({ s, arrivato }: { s: AdminSistema; arrivato: number }) {
  const io = useIo()
  const cambiaIo = useCambiaIo()
  const { esegui, occupato } = useAzione()
  const [adesso, setAdesso] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAdesso(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  // L'ora del server corre da quando e' arrivata: lo scarto con il dispositivo resta quello misurato allora.
  const scarto = useRef(new Date(s.adesso).getTime() - arrivato)
  scarto.current = new Date(s.adesso).getTime() - arrivato
  const server = adesso + scarto.current
  const prossima = Math.max(0, s.prossimaGiornataMs - (adesso - arrivato))
  const resta = io.sbloccatoFino ? new Date(io.sbloccatoFino).getTime() - adesso : 0

  return (
    <>
      <div className="adm-griglia">
        <Carta titolo="Adesso">
          <p className="adm-orologio u-tabnum">{oraPrecisa(server)}</p>
          <dl className="adm-voci">
            <div className="adm-voci__riga">
              <dt>Giornata</dt>
              <dd>
                n. {numero(s.giornata.numero)} · {giornoIntero(s.giornata.data)}
              </dd>
            </div>
            <div className="adm-voci__riga">
              <dt>La prossima fra</dt>
              <dd className="u-tabnum">{formatCountdown(prossima)}</dd>
            </div>
            <div className="adm-voci__riga">
              <dt>Questo dispositivo</dt>
              <dd>
                {Math.abs(scarto.current) < 2_000
                  ? 'In orario'
                  : `${durata(Math.abs(scarto.current))} ${scarto.current > 0 ? 'indietro' : 'avanti'}`}
              </dd>
            </div>
          </dl>
        </Carta>

        <Carta titolo="Il pannello" sotto="Su questo dispositivo">
          <dl className="adm-voci">
            <div className="adm-voci__riga">
              <dt>Il tuo ruolo</dt>
              <dd>{io.ruolo === 'proprietario' ? 'Proprietario' : 'Amministratore'}</dd>
            </div>
            <div className="adm-voci__riga">
              <dt>Aperto fino</dt>
              <dd>{io.sbloccatoFino ? `${dataOra(io.sbloccatoFino)} · ${durata(Math.max(0, resta))}` : '—'}</dd>
            </div>
          </dl>
          <div>
            <Button
              variant="destructive"
              loading={occupato === 'blocca'}
              onClick={async () => {
                const r = await esegui<AdminIo>('blocca', '/blocca', { method: 'POST' }, 'Pannello bloccato')
                if (r) cambiaIo(r)
              }}
            >
              Blocca il pannello
            </Button>
          </div>
        </Carta>
      </div>

      <Carta titolo="Configurazione">
        <ul className="adm-config">
          {s.configurazione.map((c) => (
            <li key={c.nome} className="adm-config__riga">
              <span className="adm-config__testo">
                <span className="adm-config__nome">{c.nome}</span>
                <span className="adm-config__valore adm-mono" data-selezionabile>
                  {c.valore}
                </span>
              </span>
              <Stato tono={TONO[c.stato]}>{PAROLA[c.stato]}</Stato>
            </li>
          ))}
        </ul>
      </Carta>

      <Carta
        titolo="Chi amministra"
        sotto={`${s.amministratori.length} ${s.amministratori.length === 1 ? 'persona' : 'persone'}`}
      >
        <ul className="adm-persone">
          {s.amministratori.map((a) => (
            <li key={a.id}>
              <Collegamento to={ROTTE.adminGiocatore(a.id)} className="adm-persone__riga">
                <Avatar nickname={a.nickname} color={a.avatarColor} size={34} />
                <span className="adm-persone__testo">
                  <span className="adm-persone__nome">@{a.nickname}</span>
                  {a.email && <span className="adm-persone__sotto adm-tronca">{a.email}</span>}
                </span>
                <Stato tono="neutro">{a.ruolo === 'proprietario' ? 'Proprietario' : 'Admin'}</Stato>
                <IconChevronRight size={16} className="adm-persone__freccia" />
              </Collegamento>
            </li>
          ))}
        </ul>
      </Carta>
    </>
  )
}
