import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProtocolBlock, ProtocolSection } from "@/lib/journey/types";

/** Editor clínico por secções, parágrafos, listas e tabelas — nunca JSON cru. */
export function ProtocolEditor({
  sections,
  onChange,
}: {
  sections: ProtocolSection[];
  onChange: (sections: ProtocolSection[]) => void;
}) {
  const updateSection = (index: number, section: ProtocolSection) => {
    const next = [...sections];
    next[index] = section;
    onChange(next);
  };

  return (
    <div className="space-y-6">
      {sections.map((section, sIndex) => (
        <Card key={section.id || sIndex}>
          <CardHeader className="gap-3">
            <CardTitle className="sr-only">Secção {sIndex + 1}</CardTitle>
            <div className="space-y-1.5">
              <Label htmlFor={`sec-${sIndex}`} className="text-xs text-muted-foreground">
                Título da secção
              </Label>
              <Input
                id={`sec-${sIndex}`}
                value={section.title}
                onChange={(e) => updateSection(sIndex, { ...section, title: e.target.value })}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {section.blocks.map((block, bIndex) => (
              <BlockEditor
                key={bIndex}
                block={block}
                onChange={(b) => {
                  const blocks = [...section.blocks];
                  blocks[bIndex] = b;
                  updateSection(sIndex, { ...section, blocks });
                }}
                onRemove={() =>
                  updateSection(sIndex, {
                    ...section,
                    blocks: section.blocks.filter((_, i) => i !== bIndex),
                  })
                }
              />
            ))}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["paragraph", "Parágrafo"],
                  ["list", "Lista"],
                  ["table", "Tabela"],
                  ["patientNote", "Observação ao paciente"],
                ] as const
              ).map(([type, label]) => (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateSection(sIndex, {
                      ...section,
                      blocks: [...section.blocks, newBlock(type)],
                    })
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> {label}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => onChange(sections.filter((_, i) => i !== sIndex))}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover secção
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button
        variant="outline"
        onClick={() =>
          onChange([...sections, { id: `s${sections.length + 1}-${Date.now()}`, title: "", blocks: [] }])
        }
      >
        <Plus className="mr-1 h-4 w-4" /> Adicionar secção
      </Button>
    </div>
  );
}

function newBlock(type: ProtocolBlock["type"]): ProtocolBlock {
  switch (type) {
    case "list":
      return { type: "list", items: [""] };
    case "table":
      return { type: "table", columns: ["", ""], rows: [["", ""]] };
    case "patientNote":
      return { type: "patientNote", text: "" };
    default:
      return { type: "paragraph", text: "" };
  }
}

function BlockEditor({
  block,
  onChange,
  onRemove,
}: {
  block: ProtocolBlock;
  onChange: (block: ProtocolBlock) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-border p-4">
      {block.type === "paragraph" || block.type === "patientNote" ? (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            {block.type === "patientNote" ? "Observação ao paciente (caixa dourada)" : "Parágrafo"}
          </Label>
          <Textarea rows={4} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
        </div>
      ) : block.type === "list" ? (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Lista</Label>
          {block.items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={item}
                onChange={(e) => {
                  const items = [...block.items];
                  items[i] = e.target.value;
                  onChange({ ...block, items });
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => onChange({ ...block, items: [...block.items, ""] })}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Item
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Tabela</Label>
          <div className="flex flex-wrap gap-2">
            {block.columns.map((col, i) => (
              <Input
                key={i}
                className="w-40"
                placeholder={`Coluna ${i + 1}`}
                value={col}
                onChange={(e) => {
                  const columns = [...block.columns];
                  columns[i] = e.target.value;
                  onChange({ ...block, columns });
                }}
              />
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  ...block,
                  columns: [...block.columns, ""],
                  rows: block.rows.map((r) => [...r, ""]),
                })
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Coluna
            </Button>
          </div>
          {block.rows.map((row, ri) => (
            <div key={ri} className="flex flex-wrap items-center gap-2">
              {block.columns.map((_, ci) => (
                <Input
                  key={ci}
                  className="w-40"
                  value={row[ci] ?? ""}
                  onChange={(e) => {
                    const rows = block.rows.map((r) => [...r]);
                    rows[ri]![ci] = e.target.value;
                    onChange({ ...block, rows });
                  }}
                />
              ))}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onChange({ ...block, rows: block.rows.filter((_, j) => j !== ri) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange({ ...block, rows: [...block.rows, block.columns.map(() => "")] })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Linha
          </Button>
        </div>
      )}
      <Button variant="ghost" size="sm" className="mt-3 text-muted-foreground" onClick={onRemove}>
        <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover bloco
      </Button>
    </div>
  );
}
