import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import type {
  TConnectorProvider,
  TConnectorStatus,
  TConnectorSearchResponse,
} from 'librechat-data-provider';
import type { UseQueryOptions } from '@tanstack/react-query';

export const connectorsQueryKey = ['connectors'];

/**
 * Hook para obtener el estado de los conectores (GitHub, HuggingFace).
 * Cachea los resultados por 5 minutos para reducir llamadas API.
 */
export function useConnectorsQuery(
  options?: Partial<UseQueryOptions<TConnectorStatus[]>>,
) {
  return useQuery<TConnectorStatus[]>(
    connectorsQueryKey,
    () => dataService.getConnectors(),
    {
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
      refetchOnWindowFocus: true,
      ...options,
    },
  );
}

/**
 * Hook para buscar repositorios/modelos en un proveedor.
 * Usa staleTime corto porque las búsquedas son específicas del momento.
 */
export function useConnectorSearchQuery(
  provider: TConnectorProvider,
  query: string,
  options?: Partial<UseQueryOptions<TConnectorSearchResponse>>,
) {
  return useQuery<TConnectorSearchResponse>(
    ['connector-search', provider, query],
    () => dataService.searchConnector(provider, query),
    {
      enabled: !!provider,
      staleTime: 2 * 60 * 1000,
      cacheTime: 5 * 60 * 1000,
      ...options,
    },
  );
}

/**
 * Hook para desconectar un proveedor.
 * Invalida el cache de conectores al completar.
 */
export function useDisconnectConnectorMutation() {
  const queryClient = useQueryClient();
  return useMutation((provider: TConnectorProvider) => dataService.disconnectConnector(provider), {
    onSuccess: () => {
      // Invalida cache para forzar refetch
      queryClient.invalidateQueries({ queryKey: connectorsQueryKey });
      // También limpia búsquedas pendientes
      queryClient.removeQueries({ queryKey: ['connector-search'] });
    },
  });
}

/** Abre en la misma pestaña el flujo de login OAuth del proveedor elegido. */
export function startConnectorLogin(provider: TConnectorProvider) {
  window.location.href = `/api/connectors/${provider}/login`;
}
