import { AppShell } from '@/components/AppShell'
import { Card } from '@/components/Card'
import { ThemeButton } from '@/components/ThemeButton'

/** Segnaposto usato dalle sezioni non ancora implementate. */
export default function Placeholder({ title, message }: { title: string; message: string }) {
  return (
    <AppShell title={title} trailing={<ThemeButton />}>
      <h2 className="large-title">{title}</h2>
      <Card>
        <p style={{ color: 'var(--label-secondary)' }}>{message}</p>
      </Card>
    </AppShell>
  )
}
