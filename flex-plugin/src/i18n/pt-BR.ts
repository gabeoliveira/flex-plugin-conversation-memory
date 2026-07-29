import type { Strings } from './types';

/** Português (Brasil). */
export const ptBR: Strings = {
  panelTitle: 'Memória do Cliente',
  noIdentifier: 'Nenhum identificador de cliente nesta tarefa.',
  refresh: 'Atualizar',
  ambiguousProfiles: (count) =>
    `${count} perfis correspondem a este identificador — mostrando o primeiro. Confirme se é o cliente certo.`,

  loading: 'Carregando memória do cliente',
  loadingFor: (identifier) => `Carregando memória do cliente para ${identifier}…`,
  errorTitle: (identifier) => `Falha ao carregar a memória do cliente para ${identifier}.`,
  partial: 'Não foi possível carregar alguns dados de memória. Exibindo o que está disponível.',

  tabsAriaLabel: 'Memória do cliente',
  tabTraits: 'Atributos',
  tabObservations: 'Observações',
  tabSummaries: 'Resumos',
  tabSearch: 'Buscar',
  tabCommunications: 'Mensagens',
  loadMore: 'Carregar mais',

  noTraits: 'Nenhum atributo registrado para este cliente.',
  noObservations: 'Nenhuma observação registrada para este cliente.',
  noSummaries: 'Nenhum resumo registrado para este cliente.',
  noCommunications: 'Nenhuma mensagem recente para este cliente.',

  searchAriaLabel: 'Buscar na memória do cliente e na base de conhecimento',
  searchPlaceholder: 'Buscar na memória e no conhecimento…',
  searchButton: 'Buscar',
  sectionCustomer: 'Este cliente',
  sectionKnowledge: 'Base de conhecimento',
  noMatchingMemory: 'Nenhuma memória correspondente para este cliente.',
  noMatchingKnowledge: 'Nenhum conhecimento correspondente.',
  searchIdle: 'Busque na memória deste cliente e na sua base de conhecimento.',
  searching: 'Buscando…',
  summarize: 'Resumir resultados',
  summarizing: 'Resumindo…',
  summarizingSpinner: 'Resumindo os resultados…',
  assistantSummary: 'Resumo do assistente',
  summaryDisclaimer:
    'Gerado por IA a partir dos resultados abaixo ([M#]/[K#]) — verifique nas fontes.',
  percentMatch: (pct) => `${pct}% de correspondência`,

  errSessionExpired: 'Sua sessão do Flex expirou. Recarregue o Flex e tente novamente.',
  errForbidden: 'Você não tem permissão para ver a memória do cliente.',
  errUnavailable: 'O serviço de memória está indisponível no momento. Tente novamente em instantes.',
};
