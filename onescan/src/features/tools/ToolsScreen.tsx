import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  IconName,
  TIcon,
  TNavigationBar,
  TScreen,
  TSectionHeader,
  TText,
  useTheme,
  useToast,
} from "@/design-system";
import { FeatureFlag, flagOn, useRemoteConfig } from "@/core/config/remoteConfig";
import type { CaptureMode, DocumentType } from "@/core/document-engine/model";
import { openScanner } from "@/features/home/HomeScreen";
import { useImport } from "@/features/shared/useImport";

interface Tool {
  key: string;
  icon: IconName;
  flag?: FeatureFlag;
  pro?: boolean;
  run?: () => void;
}

/** Tool Center (spec §25): everything not on Home lives here. */
export function ToolsScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const flags = useRemoteConfig((s) => s.config.flags);
  const { importPhotos, overlay: importOverlay } = useImport();
  const scan = (mode: CaptureMode, docType: DocumentType) => () =>
    openScanner({ mode, docType, source: "tools" });

  const sections: { title: string; tools: Tool[] }[] = [
    {
      title: t("tools.section_scan"),
      tools: [
        { key: "document", icon: "scan", run: scan("document", "document") },
        { key: "id", icon: "idCard", run: scan("id", "id_card") },
        { key: "receipt", icon: "receipt", run: scan("receipt", "receipt") },
        { key: "book", icon: "book", run: scan("document", "book") },
        {
          key: "whiteboard",
          icon: "whiteboard",
          run: scan("document", "whiteboard"),
        },
        {
          key: "business_card",
          icon: "businessCard",
          run: scan("id", "business_card"),
        },
      ],
    },
    {
      title: t("tools.section_pdf"),
      tools: [
        { key: "merge", icon: "merge", flag: "advancedPdf", pro: true },
        { key: "split", icon: "split", flag: "advancedPdf", pro: true },
        { key: "compress", icon: "compress", flag: "advancedPdf", pro: true },
        { key: "protect", icon: "protect", flag: "advancedPdf", pro: true },
        { key: "sign", icon: "sign", flag: "advancedPdf", pro: true },
      ],
    },
    {
      title: t("tools.section_convert"),
      tools: [
        {
          key: "image_to_pdf",
          icon: "importPhoto",
          run: () => void importPhotos(),
        },
        { key: "pdf_to_image", icon: "toImage", flag: "convert", pro: true },
        { key: "pdf_to_word", icon: "documents", flag: "convert", pro: true },
        { key: "pdf_to_excel", icon: "toExcel", flag: "convert", pro: true },
      ],
    },
    {
      title: t("tools.section_ai"),
      tools: [
        {
          key: "summarize",
          icon: "ai",
          flag: "ai",
          run: () => router.push("/ai"),
        },
        {
          key: "translate",
          icon: "translate",
          flag: "ai",
          run: () => router.push("/ai"),
        },
        {
          key: "ask_pdf",
          icon: "chat",
          flag: "ai",
          run: () => router.push("/ai"),
        },
        {
          key: "extract",
          icon: "extract",
          flag: "ai",
          run: () => router.push("/ai"),
        },
      ],
    },
  ];

  return (
    <TScreen
      scroll
      footer={importOverlay}
      header={
        <TNavigationBar title={t("tools.title")} onBack={() => router.back()} />
      }
    >
      {/* Only tools that work in this build: no "coming soon" tiles. */}
      {sections
        .map((s) => ({
          ...s,
          tools: s.tools.filter(
            (tool) => tool.run && (!tool.flag || flagOn(flags, tool.flag)),
          ),
        }))
        .filter((s) => s.tools.length > 0)
        .map((s) => (
          <View key={s.title}>
            <TSectionHeader title={s.title} />
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                backgroundColor: colors.bgContainer,
                paddingVertical: spacing.xs,
              }}
            >
              {s.tools.map((tool) => {
                const available = !tool.flag || flagOn(flags, tool.flag);
                return (
                  <Pressable
                    key={tool.key}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !available }}
                    onPress={() =>
                      available && tool.run
                        ? tool.run()
                        : toast(t("common.comingSoon"))
                    }
                    style={({ pressed }) => ({
                      width: "25%",
                      alignItems: "center",
                      paddingVertical: spacing.sm,
                      gap: spacing.xs,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: radius.md,
                        backgroundColor: colors.bgSecondary,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <TIcon
                        name={tool.icon}
                        color={available ? colors.brand : colors.textDisabled}
                      />
                      {tool.pro ? (
                        <View
                          style={{
                            position: "absolute",
                            top: -4,
                            end: -10,
                            backgroundColor: colors.warning,
                            borderRadius: radius.sm,
                            paddingHorizontal: 4,
                          }}
                        >
                          <TText
                            variant="caption"
                            color="textAnti"
                            weight="600"
                          >
                            {t("tools.pro")}
                          </TText>
                        </View>
                      ) : null}
                    </View>
                    <TText
                      variant="bodySmall"
                      align="center"
                      color={available ? "textPrimary" : "textPlaceholder"}
                      numberOfLines={2}
                      style={{ paddingHorizontal: 4 }}
                    >
                      {t(`tools.${tool.key}` as "tools.document")}
                    </TText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
    </TScreen>
  );
}
