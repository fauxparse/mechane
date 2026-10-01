// Show settings ("/shows/$showId/settings", issue #837): how the Show
// publishes (#856), and Custom domains — which of the user's addresses open
// this Show's Devices. The sections are presentational; this route supplies
// the data and the owner operations.
import { isId, type ShowId } from "@mechane/domain/id";
import { decodeShowGraphDocument, GraphQLRequestError } from "@mechane/graphql-schema";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { useCustomDomainMutations, useCustomDomains } from "../../../../api/custom-domains";
import { useShowGraph } from "../../../../api/show-graph";
import { useSetShowAutoPublish, useShow } from "../../../../api/shows";
import type { DeviceOption } from "../../../../components/CustomDomains/custom-domain-model";
import {
  CustomDomainsSection,
  type CustomDomainActions,
} from "../../../../components/CustomDomains/CustomDomainsSection";
import { PublishingSection } from "../../../../components/ShowSettings/PublishingSection";

export const Route = createFileRoute("/_authenticated/shows/$showId/settings")({
  component: ShowSettingsRoute,
});

function ShowSettingsRoute() {
  const params = Route.useParams();
  const showId: ShowId | null = isId("show", params.showId) ? params.showId : null;
  const show = useShow(showId);
  const draft = useShowGraph(showId, "draft");
  const domains = useCustomDomains();
  const mutations = useCustomDomainMutations();
  const setAutoPublish = useSetShowAutoPublish();

  const devices = useMemo<DeviceOption[]>(() => {
    if (!draft.data || !show.data) return [];
    const showName = show.data.name;
    // Only a saved Device has a pairing code, and only a saved one can be bound.
    return decodeShowGraphDocument(draft.data).graph.nodes.flatMap((node) =>
      node.kind === "device" && node.pairingCode
        ? [
            {
              showId: params.showId,
              showName,
              deviceId: node.id,
              deviceName: node.name.trim() || "Untitled Device",
            },
          ]
        : [],
    );
  }, [draft.data, params.showId, show.data]);

  const actions: CustomDomainActions = {
    add: async (hostname, device) => {
      await mutations.add.mutateAsync({
        hostname,
        showId: device.showId,
        deviceId: device.deviceId,
      });
    },
    bind: async (domain, device) => {
      await mutations.bind.mutateAsync({
        id: domain.id,
        showId: device.showId,
        deviceId: device.deviceId,
      });
    },
    unbind: async (domain) => {
      await mutations.unbind.mutateAsync(domain.id);
    },
    remove: async (domain) => {
      await mutations.remove.mutateAsync(domain.id);
    },
    checkNow: async (domain) => {
      await mutations.checkNow.mutateAsync(domain.id);
    },
  };

  const currentShow = show.data;
  return (
    <main className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 pt-20 pb-12">
        <h1 className="text-2xl font-semibold">Settings</h1>
        {currentShow ? (
          <PublishingSection
            autoPublish={currentShow.autoPublish}
            saving={setAutoPublish.isPending}
            error={
              setAutoPublish.error instanceof GraphQLRequestError
                ? setAutoPublish.error.message
                : setAutoPublish.error
                  ? "The publishing setting could not be saved."
                  : undefined
            }
            onAutoPublishChange={(autoPublish) =>
              setAutoPublish.mutate({ id: currentShow.id, autoPublish })
            }
          />
        ) : null}
        {domains.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Custom domains could not be loaded.
          </p>
        ) : !domains.data || !draft.data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <CustomDomainsSection
            showId={params.showId}
            domains={domains.data.customDomains}
            unbound={domains.data.unboundCustomDomains}
            devices={devices}
            actions={actions}
          />
        )}
      </div>
    </main>
  );
}
