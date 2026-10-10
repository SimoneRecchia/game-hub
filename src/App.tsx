import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { ROTTE, giocoDaSlug } from './app/rotte'
import { Shell } from './components/Shell'
import { Splash } from './components/Splash'
import { useAuth } from './lib/auth'
import { PresenzaProvider } from './lib/presenza'
import { CoopGate } from './games/wordle/coop/CoopGate'
import { BattagliaGate } from './games/battaglia/BattagliaGate'
import { QuizGate } from './games/quiz/sfida/QuizGate'
import { IndovinaGate } from './games/indovina/IndovinaGate'
import { TavoloGate } from './games/tavolo/TavoloGate'
import { NomiGate } from './games/nomi/sfida/NomiGate'
import { SequenzeGate } from './games/sequenze/SequenzeGate'
import { SfideGate } from './games/sfide/SfideGate'
import { LupusGate } from './games/lupus/LupusGate'
import { ScarabocchiGate } from './games/scarabocchi/ScarabocchiGate'
import { CompagniaGate } from './games/compagnia/CompagniaGate'
import { AscoltaNotifiche, ChiamataGate } from './games/amici/ChiamataGate'
import Giornaliere from './pages/Giornaliere'
import Libere from './pages/Libere'
import Fortuna from './pages/Fortuna'
import NotFound from './pages/NotFound'
import VerifyEmail from './pages/VerifyEmail'
import Welcome from './pages/Welcome'
import { GIOCHI_TAVOLIERE } from '@shared/tavolo'

/*
 * Nel pezzo che si scarica all'avvio ci sono solo le tre schede, l'accesso e
 * gli avvisi degli inviti. Ogni gioco arriva a parte, e la classifica, il
 * profilo e il profilo di un amico anche: erano un terzo dell'app che si apre,
 * e la prima schermata li aspettava tutti. I pezzi si precaricano quando il
 * telefono e' libero (`usePrecarica`), quelli delle Giornaliere per primi.
 */
const caricaClassifica = () => import('./pages/Classifica')
const caricaProfilo = () => import('./pages/Profilo')
const caricaAmico = () => import('./pages/Amico')
const Classifica = lazy(caricaClassifica)
const Profilo = lazy(caricaProfilo)
const Amico = lazy(caricaAmico)
const caricaWordle = () => import('./pages/Wordle')
const caricaWordleLibero = () => import('./pages/WordleLibero')
const caricaWordleInsieme = () => import('./pages/WordleInsieme')
const caricaWordleLiberaInsieme = () => import('./pages/WordleLiberaInsieme')
const Wordle = lazy(caricaWordle)
const WordleLibero = lazy(caricaWordleLibero)
const WordleInsieme = lazy(caricaWordleInsieme)
const WordleLiberaInsieme = lazy(caricaWordleLiberaInsieme)
const caricaScarabeo = () => import('./pages/Scarabeo')
const caricaScarabeoInsieme = () => import('./pages/ScarabeoInsieme')
const Scarabeo = lazy(caricaScarabeo)
const ScarabeoInsieme = lazy(caricaScarabeoInsieme)
const caricaCruciverba = () => import('./pages/Cruciverba')
const caricaCruciverbaLibero = () => import('./pages/CruciverbaLibero')
const caricaCruciverbaInsieme = () => import('./pages/CruciverbaInsieme')
const Cruciverba = lazy(caricaCruciverba)
const CruciverbaLibero = lazy(caricaCruciverbaLibero)
const CruciverbaInsieme = lazy(caricaCruciverbaInsieme)
const caricaSudoku = () => import('./pages/Sudoku')
const caricaSudokuLibero = () => import('./pages/SudokuLibero')
const Sudoku = lazy(caricaSudoku)
const SudokuLibero = lazy(caricaSudokuLibero)
const caricaBattagliaSala = () => import('./pages/BattagliaSala')
const caricaBattagliaPartita = () => import('./pages/BattagliaPartita')
const caricaBattagliaInvito = () => import('./pages/BattagliaInvito')
const BattagliaSala = lazy(caricaBattagliaSala)
const BattagliaPartita = lazy(caricaBattagliaPartita)
const BattagliaInvito = lazy(caricaBattagliaInvito)
const caricaIndovinaChi = () => import('./pages/IndovinaChi')
const caricaIndovinaPartita = () => import('./pages/IndovinaPartita')
const caricaIndovinaInvito = () => import('./pages/IndovinaInvito')
const caricaIndovinaSet = () => import('./pages/IndovinaSet')
const IndovinaChi = lazy(caricaIndovinaChi)
const IndovinaPartita = lazy(caricaIndovinaPartita)
const IndovinaInvito = lazy(caricaIndovinaInvito)
const IndovinaSet = lazy(caricaIndovinaSet)

/*
 * Le pagine di scacchi, dama, Forza 4 e go arrivano a parte: le regole, i pezzi e i
 * tavolieri sono un quinto dell'app, e chi apre il Wordle non li deve
 * scaricare. React Router naviga dentro una transizione di React, quindi la
 * schermata di prima resta finché la nuova non e' pronta; e il pezzo si
 * scarica quando il telefono e' libero, cosi' di solito c'e' gia'.
 */
const caricaAnagrammi = () => import('./pages/Anagrammi')
const caricaAnagrammiLibera = () => import('./pages/AnagrammiLibera')
const Anagrammi = lazy(caricaAnagrammi)
const AnagrammiLibera = lazy(caricaAnagrammiLibera)
const caricaGhigliottina = () => import('./pages/Ghigliottina')
const caricaGhigliottinaLibera = () => import('./pages/GhigliottinaLibera')
const Ghigliottina = lazy(caricaGhigliottina)
const GhigliottinaLibera = lazy(caricaGhigliottinaLibera)
const caricaParoliere = () => import('./pages/Paroliere')
const caricaParoliereLibera = () => import('./pages/ParoliereLibera')
const Paroliere = lazy(caricaParoliere)
const ParoliereLibera = lazy(caricaParoliereLibera)
const caricaCatena = () => import('./pages/Catena')
const caricaCatenaLibera = () => import('./pages/CatenaLibera')
const Catena = lazy(caricaCatena)
const CatenaLibera = lazy(caricaCatenaLibera)
// Le sfide fra amici delle libere da soli: una pagina per gioco, e una per gli inviti con il link.
const SudokuSfida = lazy(() => import('./pages/SudokuSfida'))
const AnagrammiSfida = lazy(() => import('./pages/AnagrammiSfida'))
const ParoliereSfida = lazy(() => import('./pages/ParoliereSfida'))
const GhigliottinaSfida = lazy(() => import('./pages/GhigliottinaSfida'))
const CatenaSfida = lazy(() => import('./pages/CatenaSfida'))
const SfidaLiberaInvito = lazy(() => import('./pages/SfidaLiberaInvito'))
const caricaNomi = () => import('./pages/NomiCose')
const caricaNomiLibera = () => import('./pages/NomiCoseLibera')
const caricaNomiSfida = () => import('./pages/NomiCoseSfida')
const caricaNomiInvito = () => import('./pages/NomiCoseInvito')
const NomiCose = lazy(caricaNomi)
const NomiCoseLibera = lazy(caricaNomiLibera)
const NomiCoseSfida = lazy(caricaNomiSfida)
const NomiCoseInvito = lazy(caricaNomiInvito)
const caricaSequenze = () => import('./pages/Sequenze')
const caricaSequenzeLibera = () => import('./pages/SequenzeLibera')
const caricaSequenzeSfida = () => import('./pages/SequenzeSfida')
const caricaSequenzeInvito = () => import('./pages/SequenzeInvito')
const Sequenze = lazy(caricaSequenze)
const SequenzeLibera = lazy(caricaSequenzeLibera)
const SequenzeSfida = lazy(caricaSequenzeSfida)
const SequenzeInvito = lazy(caricaSequenzeInvito)
const caricaSala = () => import('./pages/TavoloSala')
const caricaComputer = () => import('./pages/TavoloComputer')
const caricaPartita = () => import('./pages/TavoloPartita')
const caricaInvito = () => import('./pages/TavoloInvito')
const TavoloSala = lazy(caricaSala)
const TavoloComputer = lazy(caricaComputer)
const TavoloPartita = lazy(caricaPartita)
const TavoloInvito = lazy(caricaInvito)
/*
 * La partita a Scarabeo con un amico: un tavolo del server come quelli dei
 * tavolieri. Anche la libera arriva a parte, perché porta con se' la sala degli
 * amici dei tavolieri.
 */
const caricaScarabeoAmico = () => import('./pages/ScarabeoAmico')
const ScarabeoAmico = lazy(caricaScarabeoAmico)
const caricaScarabeoLibero = () => import('./pages/ScarabeoLibero')
const ScarabeoLibero = lazy(caricaScarabeoLibero)

/*
 * Anche il quiz arriva a parte, per la stessa ragione: i generatori delle
 * domande di tutte le materie, che servono solo a chi ci gioca.
 */
const caricaQuiz = () => import('./pages/Quiz')
const caricaQuizLibero = () => import('./pages/QuizLibero')
const caricaQuizDuello = () => import('./pages/QuizDuello')
const caricaQuizInvito = () => import('./pages/QuizInvito')
const Quiz = lazy(caricaQuiz)
const QuizLibero = lazy(caricaQuizLibero)
const QuizDuello = lazy(caricaQuizDuello)
const QuizInvito = lazy(caricaQuizInvito)

/* Lupus anche: le schermate della notte e del giorno, i personaggi e le loro icone. */
const caricaLupus = () => import('./pages/Lupus')
const caricaLupusTelefono = () => import('./pages/LupusTelefono')
const caricaLupusStanza = () => import('./pages/LupusStanza')
const Lupus = lazy(caricaLupus)
const LupusTelefono = lazy(caricaLupusTelefono)
const LupusStanza = lazy(caricaLupusStanza)
/* Scarabocchi: la lavagna, le due modalita' e l'album. */
const caricaScarabocchi = () => import('./pages/Scarabocchi')
const caricaScarabocchiStanza = () => import('./pages/ScarabocchiStanza')
const Scarabocchi = lazy(caricaScarabocchi)
const ScarabocchiStanza = lazy(caricaScarabocchiStanza)

/* E i giochi della Fortuna: Crazy Time, la slot, il blackjack, la roulette e il SuperEnalotto, che puntano i punti di oggi. */
const caricaRuota = () => import('./pages/Ruota')
const Ruota = lazy(caricaRuota)
const caricaSlot = () => import('./pages/Slot')
const Slot = lazy(caricaSlot)
const caricaBlackjack = () => import('./pages/Blackjack')
const Blackjack = lazy(caricaBlackjack)
const caricaTavoloBJ = () => import('./pages/BlackjackTavolo')
const BlackjackTavolo = lazy(caricaTavoloBJ)
const caricaRoulette = () => import('./pages/Roulette')
const Roulette = lazy(caricaRoulette)
const caricaTavoloRL = () => import('./pages/RouletteTavolo')
const RouletteTavolo = lazy(caricaTavoloRL)
// La diretta del SuperEnalotto, con three.js, arriva a parte: la precarica prende solo la pagina.
const caricaSuperEnalotto = () => import('./pages/SuperEnalotto')
const SuperEnalotto = lazy(caricaSuperEnalotto)

/** Quanti pezzi si scaricano insieme, a ogni momento libero del telefono. */
const PEZZI_PER_VOLTA = 4

/**
 * Precarica i pezzi dell'app, perché toccando un gioco ci sia gia'. Comincia
 * un paio di secondi dopo l'avvio, e va a gruppi, uno per ogni momento libero
 * del telefono (`requestIdleCallback`): tutti insieme, erano un centinaio di
 * file che si contendevano la rete e il processore con la prima schermata. Per
 * primi i giochi delle Giornaliere, che si aprono di piu', poi la classifica e
 * il profilo, poi il resto.
 */
function usePrecarica() {
  useEffect(() => {
    const coda = [
      caricaWordle,
      caricaScarabeo,
      caricaCruciverba,
      caricaSudoku,
      caricaQuiz,
      caricaNomi,
      caricaAnagrammi,
      caricaSequenze,
      caricaGhigliottina,
      caricaParoliere,
      caricaCatena,
      caricaClassifica,
      caricaProfilo,
      caricaAmico,
      caricaWordleLibero,
      caricaCruciverbaLibero,
      caricaSudokuLibero,
      caricaScarabeoLibero,
      caricaQuizLibero,
      caricaAnagrammiLibera,
      caricaGhigliottinaLibera,
      caricaParoliereLibera,
      caricaCatenaLibera,
      caricaNomiLibera,
      caricaSequenzeLibera,
      caricaSala,
      caricaComputer,
      caricaPartita,
      caricaInvito,
      caricaScarabeoAmico,
      caricaBattagliaSala,
      caricaBattagliaPartita,
      caricaIndovinaChi,
      caricaIndovinaPartita,
      caricaRuota,
      caricaSlot,
      caricaBlackjack,
      caricaTavoloBJ,
      caricaRoulette,
      caricaTavoloRL,
      caricaSuperEnalotto,
      caricaWordleInsieme,
      caricaScarabeoInsieme,
      caricaCruciverbaInsieme,
      caricaWordleLiberaInsieme,
      caricaNomiSfida,
      caricaNomiInvito,
      caricaSequenzeSfida,
      caricaSequenzeInvito,
      caricaQuizDuello,
      caricaQuizInvito,
      caricaBattagliaInvito,
      caricaIndovinaInvito,
      caricaIndovinaSet,
      caricaLupus,
      caricaLupusTelefono,
      caricaLupusStanza,
      caricaScarabocchi,
      caricaScarabocchiStanza,
    ]
    let fermo = false
    // Safari non ha `requestIdleCallback`: li' un attimo di pausa fra un gruppo e l'altro.
    const libero = (fai: () => void) =>
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(fai, { timeout: 2_000 })
        : setTimeout(fai, 200)
    const prossimi = () => {
      if (fermo || coda.length === 0) return
      const gruppo = coda.splice(0, PEZZI_PER_VOLTA)
      void Promise.all(gruppo.map((c) => c().catch(() => {}))).then(() => libero(prossimi))
    }
    const t = window.setTimeout(() => libero(prossimi), 2_000)
    return () => {
      fermo = true
      window.clearTimeout(t)
    }
  }, [])
}

/** Un invito col link aperto da chi non ha ancora un account: la registrazione lo sa. */
const INVITO = new RegExp(
  '^/(?:battaglia-navale/invito|quiz/sfida|lupus/stanza|scarabocchi/stanza|' +
    '(?:indovina-chi|scacchi|dama|forza-4|go|tris/libera|scarabeo/libera|nomi-cose-citta|sequenze|' +
    '(?:sudoku|anagrammi|paroliere|ghigliottina|catena)/libera)/invito)' +
    '/([A-Za-z0-9]+)/?$',
)

export default function App() {
  const { player, checking, config } = useAuth()
  const { pathname } = useLocation()
  usePrecarica()

  // Prima di sapere se la sessione salvata e' valida non mostriamo nulla:
  // meglio un istante di splash che far lampeggiare la schermata di accesso
  // a chi e' già dentro.
  if (checking && !player) return <Splash />

  /*
   * Nessuna rotta e' raggiungibile senza un giocatore: l'app esiste per tenere
   * i punteggi. L'indirizzo pero' resta quello aperto — per esempio un invito a
   * una battaglia — e dopo l'accesso o la registrazione si arriva lì.
   */
  const invito = INVITO.exec(pathname)?.[1] ?? null
  if (!player) return <Welcome invito={invito} />

  /*
   * Email da confermare: si mostra solo la schermata del codice. Il vincolo
   * vero e' lato server (requireVerified): questo evita di far vedere un'app
   * dove ogni cosa risponderebbe 403.
   */
  if (config?.emailVerificationRequired && !player.emailVerified) return <VerifyEmail invito={invito} />

  return (
    <PresenzaProvider>
      {/* Gli avvisi degli inviti vivono fuori dalle rotte: devono poter
          comparire da qualunque schermata. Leggono lo stesso giro di
          controllo, che fa anche da presenza. */}
      <CoopGate />
      <BattagliaGate />
      <QuizGate />
      <IndovinaGate />
      <TavoloGate />
      <NomiGate />
      <SequenzeGate />
      <SfideGate />
      <LupusGate />
      <ScarabocchiGate />
      <CompagniaGate />
      <ChiamataGate />
      <AscoltaNotifiche />
      <Shell>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Giornaliere />} />
            <Route path={ROTTE.libere} element={<Libere />} />
            <Route path="/classifica" element={<Classifica />} />
            <Route path="/classifica/:gioco" element={<Classifica />} />
            <Route path="/profilo" element={<Profilo />} />
            <Route path="/amici/:nickname" element={<Amico />} />

            <Route path="/wordle/classificata" element={<Wordle />} />
            <Route path="/wordle/libera" element={<WordleLibero />} />
            <Route path="/wordle/insieme/:roomId" element={<WordleInsieme />} />
            <Route path="/wordle/libera/insieme/:id" element={<WordleLiberaInsieme />} />

            <Route path="/scarabeo/classificata" element={<Scarabeo />} />
            <Route path="/scarabeo/libera" element={<ScarabeoLibero />} />
            <Route path="/scarabeo/insieme/:id" element={<ScarabeoInsieme />} />
            <Route path="/scarabeo/libera/insieme/:id" element={<ScarabeoInsieme />} />
            {/* Lo Scarabeo con un amico sta sul tavolo del server, con l'invito con il link dei tavolieri. */}
            <Route path="/scarabeo/libera/partita/:id" element={<ScarabeoAmico />} />
            <Route path="/scarabeo/libera/invito/:codice" element={<TavoloInvito gioco="scarabeo" />} />

            <Route path="/cruciverba/classificata" element={<Cruciverba />} />
            <Route path="/cruciverba/libera" element={<CruciverbaLibero />} />
            <Route path="/cruciverba/libera/:id" element={<Cruciverba />} />
            <Route path="/cruciverba/insieme/:id" element={<CruciverbaInsieme />} />
            <Route path="/cruciverba/libera/insieme/:id" element={<CruciverbaInsieme />} />

            <Route path="/sudoku/classificata" element={<Sudoku />} />
            <Route path="/sudoku/libera" element={<SudokuLibero />} />
            <Route path="/sudoku/libera/sfida/:id" element={<SudokuSfida />} />
            <Route path="/sudoku/libera/invito/:codice" element={<SfidaLiberaInvito gioco="sudoku" />} />

            {/* La battaglia e' un gioco da tavolo: la sala sta all'indirizzo del gioco. */}
            <Route path={ROTTE.battaglia} element={<BattagliaSala />} />
            <Route path="/battaglia-navale/partita/:id" element={<BattagliaPartita />} />
            <Route path="/battaglia-navale/invito/:codice" element={<BattagliaInvito />} />

            <Route path="/quiz/classificata" element={<Quiz />} />
            <Route path="/quiz/libera" element={<QuizLibero />} />
            <Route path="/quiz/libera/:materia" element={<QuizLibero />} />
            <Route path="/quiz/duello/:id" element={<QuizDuello />} />
            <Route path="/quiz/sfida/:codice" element={<QuizInvito />} />


            <Route path="/anagrammi/classificata" element={<Anagrammi />} />
            <Route path="/anagrammi/libera" element={<AnagrammiLibera />} />
            <Route path="/anagrammi/libera/sfida/:id" element={<AnagrammiSfida />} />
            <Route path="/anagrammi/libera/invito/:codice" element={<SfidaLiberaInvito gioco="anagrammi" />} />
            <Route path="/ghigliottina/classificata" element={<Ghigliottina />} />
            <Route path="/ghigliottina/libera" element={<GhigliottinaLibera />} />
            <Route path="/ghigliottina/libera/sfida/:id" element={<GhigliottinaSfida />} />
            <Route path="/ghigliottina/libera/invito/:codice" element={<SfidaLiberaInvito gioco="ghigliottina" />} />
            <Route path="/paroliere/classificata" element={<Paroliere />} />
            <Route path="/paroliere/libera" element={<ParoliereLibera />} />
            <Route path="/paroliere/libera/sfida/:id" element={<ParoliereSfida />} />
            <Route path="/paroliere/libera/invito/:codice" element={<SfidaLiberaInvito gioco="paroliere" />} />
            <Route path="/catena/classificata" element={<Catena />} />
            <Route path="/catena/libera" element={<CatenaLibera />} />
            <Route path="/catena/libera/sfida/:id" element={<CatenaSfida />} />
            <Route path="/catena/libera/invito/:codice" element={<SfidaLiberaInvito gioco="catena" />} />

            <Route path="/nomi-cose-citta/classificata" element={<NomiCose />} />
            <Route path="/nomi-cose-citta/libera" element={<NomiCoseLibera />} />
            <Route path="/nomi-cose-citta/sfida/:id" element={<NomiCoseSfida />} />
            <Route path="/nomi-cose-citta/invito/:codice" element={<NomiCoseInvito />} />
            <Route path="/sequenze/classificata" element={<Sequenze />} />
            <Route path="/sequenze/libera" element={<SequenzeLibera />} />
            <Route path="/sequenze/sfida/:id" element={<SequenzeSfida />} />
            <Route path="/sequenze/invito/:codice" element={<SequenzeInvito />} />

            <Route path={ROTTE.fortuna} element={<Fortuna />} />
            <Route path={ROTTE.ruota} element={<Ruota />} />
            <Route path={ROTTE.slot} element={<Slot />} />
            <Route path={ROTTE.blackjack} element={<Blackjack />} />
            <Route path="/blackjack/tavolo/:id" element={<BlackjackTavolo />} />
            <Route path={ROTTE.roulette} element={<Roulette />} />
            <Route path={ROTTE.superenalotto} element={<SuperEnalotto />} />
            <Route path="/roulette/tavolo/:id" element={<RouletteTavolo />} />
            <Route path="/ruota" element={<Navigate to={ROTTE.ruota} replace />} />

            <Route path="/indovina-chi" element={<IndovinaChi />} />
            <Route path="/indovina-chi/partita/:id" element={<IndovinaPartita />} />
            <Route path="/indovina-chi/invito/:codice" element={<IndovinaInvito />} />
            <Route path="/indovina-chi/set/:id" element={<IndovinaSet />} />

            {/* Lupus: la sala, la partita a un telefono, una stanza online. */}
            <Route path={ROTTE.lupus} element={<Lupus />} />
            <Route path={ROTTE.telefonoLupus} element={<LupusTelefono />} />
            <Route path="/lupus/stanza/:codice" element={<LupusStanza />} />
            {/* Scarabocchi: la sala, e una stanza con il suo codice. */}
            <Route path={ROTTE.scarabocchi} element={<Scarabocchi />} />
            <Route path="/scarabocchi/stanza/:codice" element={<ScarabocchiStanza />} />

            {/* Scacchi, dama, Forza 4, go e tris: la sala, contro il computer, la partita con un amico, l'invito.
                La sala del tris e' rimasta a /tris/libera, dove stava quando il tris aveva una classificata. */}
            {GIOCHI_TAVOLIERE.flatMap((g) => {
              const a = ROTTE.tavolo(g)
              return [
                <Route key={a} path={a} element={<TavoloSala key={g} gioco={g} />} />,
                <Route key={`${a}/c`} path={`${a}/computer`} element={<TavoloComputer key={g} gioco={g} />} />,
                <Route key={`${a}/p`} path={`${a}/partita/:id`} element={<TavoloPartita key={g} gioco={g} />} />,
                <Route key={`${a}/i`} path={`${a}/invito/:codice`} element={<TavoloInvito key={g} gioco={g} />} />,
              ]
            })}

            {/* L'indirizzo di un gioco, /wordle o /quiz, porta alla partita di oggi. */}
            <Route path="/:gioco" element={<AllaClassificata />} />

            {/* I vecchi indirizzi, perché i link salvati e le icone sulla Home non si rompano. */}
            <Route path="/insieme/:roomId" element={<Vecchio verso={(p) => ROTTE.insieme(p.roomId ?? '')} />} />
            <Route path="/battaglia" element={<Navigate to={ROTTE.battaglia} replace />} />
            {/* La classificata della battaglia non c'e' piu', e la libera e' diventata la sala. */}
            <Route path="/battaglia-navale/classificata" element={<Navigate to={ROTTE.battaglia} replace />} />
            <Route path="/battaglia-navale/libera" element={<Navigate to={ROTTE.battaglia} replace />} />
            {/* La classificata del tris non c'e' piu': il suo indirizzo, e quello del gioco, portano alla sala. */}
            <Route path="/tris" element={<Navigate to={ROTTE.tavolo('tris')} replace />} />
            <Route path="/tris/classificata" element={<Navigate to={ROTTE.tavolo('tris')} replace />} />
            <Route path="/battaglia/:id" element={<Vecchio verso={(p) => ROTTE.partitaBattaglia(p.id ?? '')} />} />
            <Route path="/salotto" element={<Navigate to={ROTTE.libere} replace />} />
            {/* Le cinque parole di prima: ora la classificata e' una parola sola. */}
            <Route path="/wordle/classificata/:slot" element={<Navigate to={ROTTE.classificata('wordle')} replace />} />
            <Route path="/wordle/:slot" element={<Navigate to={ROTTE.classificata('wordle')} replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Shell>
    </PresenzaProvider>
  )
}

/**
 * Un gioco non ha piu' una pagina sua: dalla schermata iniziale si va dritti
 * alla partita di oggi o alla scelta della libera, e l'indirizzo del gioco —
 * quello dei sottodomini, dei link salvati — porta alla partita di oggi.
 */
function AllaClassificata() {
  const { gioco } = useParams()
  const id = giocoDaSlug(gioco)
  return id ? <Navigate to={ROTTE.classificata(id)} replace /> : <NotFound />
}

/** Un indirizzo di prima, che porta a quello di adesso. */
function Vecchio({ verso }: { verso: (parametri: Readonly<Record<string, string | undefined>>) => string }) {
  const parametri = useParams()
  return <Navigate to={verso(parametri)} replace />
}
