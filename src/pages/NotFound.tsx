import { Link } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Card } from '@/components/Card'

export default function NotFound() {
  return (
    <AppShell title="Pagina non trovata">
      <h2 className="large-title">404</h2>
      <Card footnote={<Link to="/">Torna all'hub</Link>}>
        <p style={{ color: 'var(--label-secondary)' }}>
          Questa pagina non esiste. Forse il gioco che cerchi non è ancora stato aggiunto.
        </p>
      </Card>
    </AppShell>
  )
}
