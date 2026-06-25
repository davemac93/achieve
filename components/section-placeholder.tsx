import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function SectionPlaceholder({
  title,
  description,
  note,
}: {
  title: string
  description: string
  note?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {note ? (
        <CardContent>
          <p className="text-muted-foreground text-sm">{note}</p>
        </CardContent>
      ) : null}
    </Card>
  )
}
