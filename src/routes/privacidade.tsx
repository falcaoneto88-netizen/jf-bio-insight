import { createFileRoute } from "@tanstack/react-router";

import { BrandHeader } from "@/components/BrandHeader";
import { PRIVACY_POLICY_VERSION } from "@/lib/anamnesis/form";

/**
 * Fatos que só o responsável pelo tratamento pode confirmar. Enquanto algum
 * deles continuar com o marcador abaixo, a política não pode ser publicada —
 * o teste em tests/anamnesis.test.mjs recusa esse estado.
 */
export const PRIVACY_REVISION = "14 de outubro de 2026";
export const PRIVACY_RESPONSIBLE = "[preencher: quem responde pelos dados]";
export const PRIVACY_RESPONSIBLE_ID = "[preencher: CNPJ, se houver]";
export const PRIVACY_CONTACT = "[preencher: e-mail e/ou telefone para pedidos sobre seus dados]";
export const PRIVACY_RETENTION = "[preencher: tempo de guarda dos prontuários e exames]";

const PLACEHOLDER = "[preencher";

/** Verdadeiro enquanto faltar algum fato confirmado pelo responsável. */
export function privacyPolicyIsDraft() {
  return [
    PRIVACY_RESPONSIBLE,
    PRIVACY_RESPONSIBLE_ID,
    PRIVACY_CONTACT,
    PRIVACY_RETENTION,
  ].some((value) => value.startsWith(PLACEHOLDER));
}

const sections = [
  {
    title: "Quem somos e quem responde pelos seus dados",
    body: [
      `Este site é usado no atendimento clínico de ${PRIVACY_RESPONSIBLE}${
        PRIVACY_RESPONSIBLE_ID.startsWith(PLACEHOLDER) ? "" : `, ${PRIVACY_RESPONSIBLE_ID}`
      }. O profissional que conduz o seu atendimento é o responsável pelo uso e pela guarda das informações que você entrega aqui.`,
      "O BioReport Studio é a ferramenta desse atendimento: recebe a sua anamnese, os exames de bioimpedância e as orientações escritas pelo profissional.",
    ],
  },
  {
    title: "Que dados coletamos",
    body: [
      "Pelo formulário que você recebe: nome, idade, data da consulta, rotina de sono e de trabalho, contexto familiar, histórico de saúde, medicamentos em uso, cirurgias e alergias, hábitos, preferências alimentares e queixas.",
      "No consultório: medidas e exames de bioimpedância, composição corporal, avaliações e o plano alimentar, de suplementação e de medicação escrito pelo profissional.",
      "No agendamento: nome, e-mail, telefone e o histórico de consultas.",
    ],
  },
  {
    title: "Para que usamos cada dado",
    body: [
      "Para avaliar você com segurança, planejar e acompanhar o tratamento, comparar exames ao longo do tempo e registrar o prontuário.",
      "Para confirmar a sua identidade no atendimento e falar com você sobre horários, orientações e retornos.",
      "Nada é usado para publicidade, venda de listas ou perfil de consumo.",
    ],
  },
  {
    title: "Base legal para o uso",
    body: [
      "Os dados de saúde são tratados para a tutela da sua saúde, por profissional habilitado, e para a execução do atendimento contratado com você.",
      "A aceitação desta política é registrada com data e versão, junto da anamnese que você confirma.",
    ],
  },
  {
    title: "Com quem os dados são compartilhados",
    body: [
      "Com a equipe autorizada do consultório, apenas na conta de trabalho do profissional.",
      "Com o CRM de agendamentos, que guarda contato, consulta e anamnese para o atendimento funcionar.",
      "Com o assistente de inteligência artificial usado na redação de protocolos: ele recebe os campos estruturados sem nome, e-mail e telefone, e as respostas dele não ficam registradas. Textos livres que você escreveu podem conter identificadores, por isso não dizemos que os dados enviados à IA são anonimizados.",
      "Com um serviço de acompanhamento interno que recebe apenas identificadores técnicos e datas, sem nome, contato, medidas ou texto clínico.",
      "Nenhuma dessas partes usa seus dados para fins próprios, e nada é vendido.",
    ],
  },
  {
    title: "Por quanto tempo ficam guardados",
    body: [
      `${PRIVACY_RETENTION} Os documentos clínicos já emitidos e aprovados são preservados como foram entregues a você, sem reescrita.`,
    ],
  },
  {
    title: "Seus direitos e como exercer",
    body: [
      "Você pode pedir acesso, correção, informação sobre com quem dividimos, eliminação do que não precisa ser guardado e revogação de um aceite.",
      `Peça pelo canal ${PRIVACY_CONTACT}. Respondemos e registramos o pedido. A eliminação não alcança o que a lei obriga a conservar.`,
    ],
  },
  {
    title: "Como funciona o link do formulário",
    body: [
      "Você recebe um link pessoal, com prazo de validade. Quem tiver o link consegue abrir o formulário com o seu nome e a data da consulta.",
      "Por isso, não repasse o link, não o cole em grupos e não o encaminhe por engano. Se ele chegar a outra pessoa, avise a clínica para que um novo seja emitido.",
    ],
  },
  {
    title: "Contato do responsável",
    body: [
      `${PRIVACY_RESPONSIBLE}${
        PRIVACY_RESPONSIBLE_ID.startsWith(PLACEHOLDER) ? "" : ` — ${PRIVACY_RESPONSIBLE_ID}`
      }`,
      `Canal para pedidos sobre seus dados: ${PRIVACY_CONTACT}.`,
    ],
  },
];

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Dr. João Falcão" },
      {
        name: "description",
        content:
          "Como as informações de saúde do paciente são coletadas, usadas, guardadas e protegidas no atendimento do Dr. João Falcão, e como pedir acesso, correção ou exclusão.",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Política de Privacidade — Dr. João Falcão" },
      {
        property: "og:description",
        content:
          "Quais dados de saúde são coletados no atendimento, com que finalidade, por quanto tempo e como exercer seus direitos.",
      },
      {
        property: "og:url",
        content: "https://jf-bio-insight.lovable.app/privacidade",
      },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Política de Privacidade — Dr. João Falcão" },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://jf-bio-insight.lovable.app/privacidade",
      },
    ],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <main className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Política de Privacidade
        </p>
        <h1 className="mt-3 font-serif text-4xl text-foreground">
          Seus dados de saúde, com o mesmo cuidado do atendimento
        </h1>
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Esta página explica, em linguagem direta, o que é coletado, para que serve, quem tem
          acesso, por quanto tempo fica guardado e como você pode pedir acesso, correção ou
          exclusão. Ela não pede login e não mostra dado de nenhum paciente.
        </p>
        {privacyPolicyIsDraft() && (
          <p
            role="status"
            className="mt-6 border-l-2 border-gold bg-muted/40 px-4 py-3 text-sm text-foreground"
          >
            Texto em revisão: faltam informações do responsável pelo tratamento. Não publique esta
            versão.
          </p>
        )}
        <ol className="mt-12 space-y-10">
          {sections.map((section, index) => (
            <li key={section.title}>
              <h2 className="flex items-baseline gap-3 font-serif text-xl text-foreground">
                <span className="text-sm tabular-nums text-gold">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {section.title}
              </h2>
              <div className="mt-3 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="max-w-prose text-sm leading-relaxed text-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>
        <footer className="mt-14 border-t border-border/60 pt-6 text-xs text-muted-foreground">
          <p>
            Versão {PRIVACY_POLICY_VERSION} · atualizada em {PRIVACY_REVISION}.
          </p>
          <p className="mt-1">
            Alterações relevantes nesta página são numeradas e passam a valer na data desta
            atualização; a versão aceita por você fica registrada junto da anamnese.
          </p>
        </footer>
      </main>
    </div>
  );
}
