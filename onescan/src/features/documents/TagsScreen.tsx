import React, { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TCell, TDialog, TDivider, TEmpty, TIconButton, TInput, TNavigationBar, TScreen, useTheme, useToast } from '@/design-system';
import type { TagRecord } from '@/core/document-engine/model';
import { TagService } from '@/core/document-engine/services/TagService';
import { useDocuments } from './documentsStore';
import { useTagErrorText } from './DocumentSheets';

type Edit = { kind: 'create' } | { kind: 'rename'; tag: TagRecord } | { kind: 'delete'; tag: TagRecord } | null;

/** All tags: create, rename, delete. Deleting a tag never deletes documents. */
export function TagsScreen() {
  const { t } = useTranslation();
  const { spacing, colors } = useTheme();
  const toast = useToast();
  const errorText = useTagErrorText();
  const tags = useDocuments((s) => s.tags);
  const refresh = useDocuments((s) => s.refresh);
  const [edit, setEdit] = useState<Edit>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const open = (e: Edit) => {
    setName(e?.kind === 'rename' ? e.tag.name : '');
    setError(null);
    setEdit(e);
  };
  const close = () => setEdit(null);
  const save = async () => {
    try {
      if (edit?.kind === 'create') await TagService.create(name);
      else if (edit?.kind === 'rename') await TagService.rename(edit.tag.id, name);
      close();
      await refresh();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <TScreen
      surface="container"
      header={
        <TNavigationBar
          title={t('tags.manage')}
          onBack={() => router.back()}
          right={<TIconButton testID="tags-create" icon="plus" accessibilityLabel={t('tags.create')} onPress={() => open({ kind: 'create' })} />}
        />
      }
    >
      <FlatList
        data={tags}
        keyExtractor={(x) => x.id}
        ItemSeparatorComponent={() => <TDivider inset={spacing.md + 24 + spacing.sm} />}
        renderItem={({ item }) => (
          <TCell
            testID={`tag-${item.name}`}
            icon="tag"
            iconColor={colors.brand}
            title={item.name}
            note={t('tags.count', { count: item.count })}
            onPress={() => open({ kind: 'rename', tag: item })}
            right={<TIconButton testID={`tag-delete-${item.name}`} icon="delete" accessibilityLabel={t('tags.delete')} color={colors.textSecondary} onPress={() => setEdit({ kind: 'delete', tag: item })} />}
          />
        )}
        ListEmptyComponent={<TEmpty icon="tag" title={t('tags.empty')} description={t('tags.empty_hint')} actionLabel={t('tags.create')} onAction={() => open({ kind: 'create' })} />}
        contentContainerStyle={{ flexGrow: 1 }}
      />
      <TDialog
        visible={edit?.kind === 'create' || edit?.kind === 'rename'}
        title={edit?.kind === 'rename' ? t('tags.rename') : t('tags.create')}
        onRequestClose={close}
        actions={[
          { label: t('common.cancel'), onPress: close },
          { label: t('common.save'), tone: 'primary', onPress: () => void save() },
        ]}
      >
        <View>
          <TInput
            testID="tag-name"
            value={name}
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
            autoFocus
            maxLength={30}
            placeholder={t('tags.new_placeholder')}
            error={error ?? undefined}
            onSubmitEditing={() => void save()}
          />
        </View>
      </TDialog>
      <TDialog
        visible={edit?.kind === 'delete'}
        title={edit?.kind === 'delete' ? t('tags.delete_title', { name: edit.tag.name }) : ''}
        content={t('tags.delete_body')}
        onRequestClose={close}
        actions={[
          { label: t('common.cancel'), onPress: close },
          {
            label: t('tags.delete'),
            tone: 'danger',
            onPress: async () => {
              if (edit?.kind === 'delete') await TagService.remove(edit.tag.id);
              close();
              await refresh();
              toast(t('tags.deleted'));
            },
          },
        ]}
      />
    </TScreen>
  );
}
