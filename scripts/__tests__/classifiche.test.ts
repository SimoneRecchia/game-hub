import { describe, expect, it } from 'vitest'
import { FONTI, crediti, leggiModelli, nomeNormale, successiDellaPagina } from '../cultura/classifiche'

const fonte = (c: string) => FONTI.find((f) => f.classifica === c)!

describe('le classifiche di Wikipedia', () => {
  it('la classifica annuale della FIMI: posto, titolo, chi canta e gli ospiti', () => {
    const testo = `{| class="wikitable sortable"
|-
! scope="col"| {{Abbr|N°|Numero}}
! scope="col"| Titolo
! scope="col"| Artista(i)
|-
| scope="row" | 1
| [[Cenere (Lazza)|Cenere]] || [[Lazza]]
|-
| scope="row" | 4
| [[Gelosa]] || [[Finesse (musicista)|Finesse]] feat. [[Shiva (rapper)|Shiva]], [[Sfera Ebbasta]] e [[Guè]]
|-
| scope="row" | 95
| [[La musica non c'è]] || rowspan="2= | [[Coez]]
|}`
    const s = successiDellaPagina(fonte('italia'), 'Classifica dei singoli più venduti in Italia nel 2023', testo)
    expect(s.map((x) => [x.anno, x.posto, x.titolo, x.pagina])).toEqual([
      [2023, 1, 'Cenere', 'Cenere (Lazza)'],
      [2023, 4, 'Gelosa', 'Gelosa'],
      [2023, 95, "La musica non c'è", "La musica non c'è"],
    ])
    expect(s[1].artisti).toEqual([{ nome: 'Finesse', pagina: 'Finesse (musicista)' }])
    expect(s[1].ospiti.map((c) => c.nome)).toEqual(['Shiva', 'Sfera Ebbasta', 'Guè'])
    // Gli attributi scritti male stanno prima della sbarra, come per MediaWiki.
    expect(s[2].artisti).toEqual([{ nome: 'Coez', pagina: 'Coez' }])
  })

  it('i numeri uno italiani: le settimane sono le righe, anche quelle coperte da una cella sola', () => {
    const testo = `{| class="wikitable"
!colspan="3"|''[[Musica e dischi]]'' Singles Chart
|-
!Issue date
!Song
!Artist
|-
| January 4
|align="center" rowspan="3"|"E la vita, la vita"
|align="center" rowspan="3"| [[Cochi e Renato]]
|-
| January 11
|-
| January 18
|-
| February 1
|align="center" |"[[Un corpo e un'anima]]"
|align="center" "|[[Wess]] & [[Dori Ghezzi]]
|}`
    const s = successiDellaPagina(fonte('italia-1'), 'List of number-one hits of 1975 (Italy)', testo)
    expect(s.map((x) => [x.titolo, x.settimane, x.posto, x.pagina ?? null])).toEqual([
      ['E la vita, la vita', 3, 1, null],
      ["Un corpo e un'anima", 1, 1, "Un corpo e un'anima"],
    ])
    expect(s[1].artisti.map((c) => c.pagina)).toEqual(['Wess', 'Dori Ghezzi'])
  })

  it('i numeri uno inglesi di un decennio: l’anno dalla data, le settimane dalla colonna, e i modelli', () => {
    const testo = `{|class="wikitable plainrowheaders sortable"
!scope=col|{{Abbr|No.|Number}}
!scope=col|Artist{{#tag:ref|The artist [[Official Charts Company]].|group=lower-alpha|name=all}}
!scope=col|Single<ref group=lower-alpha name=all/>
!scope=col|Week ending date
!scope=col|Weeks at<br/>number one
|-class=unsortable
! colspan="5" scope="row" |{{Anchor|1980}}{{Sort|447.1|1980}}
|-
!scope=row|451
| {{sortname|Kenny|Rogers}}||"[[Coward of the County]]"
|{{dts|format=dmy|1980|2|16}}||align=center|2
|-
!scope=row|454
| {{sort|Jam|[[The Jam]]}}||"[[Going Underground|Going Underground" / "Dreams of Children]]"
|{{dts|format=dmy|1981|3|22}}||align=center|3
|}`
    const s = successiDellaPagina(fonte('regno-unito-1'), 'List of UK singles chart number ones of the 1980s', testo)
    expect(s.map((x) => [x.anno, x.titolo, x.settimane, x.artisti[0].pagina])).toEqual([
      [1980, 'Coward of the County', 2, 'Kenny Rogers'],
      [1981, 'Going Underground / Dreams of Children', 3, 'The Jam'],
    ])
  })

  it('le intestazioni su due righe: il titolo e chi canta della prima classifica', () => {
    const testo = `{| class="wikitable plainrowheaders"
|+{{sronly|Chart history}}
!scope=col rowspan=2|Issue date
!scope=col colspan=2|Hot Latin Songs
!scope=col colspan=2|Latin Airplay
|-
!scope=col|Title
!scope=col|Artist(s)
!scope=col|Title
!scope=col|Artist(s)
|-
!scope="row"|January 5
|rowspan="2"|"[[Taki Taki (song)|Taki Taki]]"
|rowspan="2"|[[DJ Snake]] featuring [[Selena Gomez]], [[Ozuna (singer)|Ozuna]] and [[Cardi B]]
| "[[Mia (Bad Bunny song)|Mia]]"
| [[Bad Bunny]] featuring [[Drake (musician)|Drake]]
|-
!scope="row"|January 12
| "[[Mia (Bad Bunny song)|Mia]]"
| [[Bad Bunny]] featuring [[Drake (musician)|Drake]]
|}`
    const pagina = 'List of Billboard Hot Latin Songs and Latin Airplay number ones of 2019'
    const s = successiDellaPagina(fonte('latina-1'), pagina, testo)
    expect(s.map((x) => [x.titolo, x.settimane, x.artisti.map((c) => c.nome), x.ospiti.length])).toEqual([
      ['Taki Taki', 2, ['DJ Snake'], 3],
    ])
  })

  it('le tabelle senza titolo o senza chi canta non sono classifiche', () => {
    const testo = `{| class="wikitable"
! Position !! Artist !! Weeks #1
|-
| 1 || [[Claudio Baglioni]] || 14
|}`
    expect(successiDellaPagina(fonte('italia-1'), 'List of number-one hits of 1975 (Italy)', testo)).toEqual([])
  })

  it('i crediti: chi canta prima del feat., gli ospiti dopo, e i nomi senza collegamento', () => {
    expect(crediti('[[Post Malone]] and [[Swae Lee]]').artisti.map((c) => c.nome)).toEqual(['Post Malone', 'Swae Lee'])
    expect(crediti('[[Lil Nas X]] featuring [[Billy Ray Cyrus]]')).toEqual({
      artisti: [{ nome: 'Lil Nas X', pagina: 'Lil Nas X' }],
      ospiti: [{ nome: 'Billy Ray Cyrus', pagina: 'Billy Ray Cyrus' }],
    })
    expect(crediti('[[Fedez]] con [[Annalisa (cantante)|Annalisa]]').ospiti.map((c) => c.nome)).toEqual(['Annalisa'])
    // Un nome che conta e' un collegamento; il testo fra due nomi e' solo un separatore.
    expect(crediti('Adriano Celentano').artisti).toEqual([{ nome: 'Adriano Celentano' }])
    expect(crediti('[[Captain & Tennille]]').artisti).toEqual([
      { nome: 'Captain & Tennille', pagina: 'Captain & Tennille' },
    ])
  })

  it('i modelli: le note spariscono, i nomi ordinati restano', () => {
    expect(leggiModelli('Artist{{#tag:ref|una nota con [[un collegamento]]|name=all}}')).toBe('Artist')
    expect(leggiModelli('{{sortname|Fern|Kinney}}')).toBe('[[Fern Kinney|Fern Kinney]]')
    expect(leggiModelli('{{sortname|Fern|Kinney|nolink=1}}')).toBe('Fern Kinney')
    expect(leggiModelli('{{dts|format=dmy|1980|1|19}}')).toBe('1980-1-19')
    expect(leggiModelli('x<ref name="a">{{cite web|url=y|title=z}}</ref> y')).toBe('x y')
  })

  it('i nomi si confrontano senza accenti, segni e "The"', () => {
    expect(nomeNormale('The Black Eyed Peas')).toBe('black eyed peas')
    expect(nomeNormale('Guè')).toBe(nomeNormale('Gue'))
    expect(nomeNormale('Simon & Garfunkel')).toBe('simon and garfunkel')
  })
})
