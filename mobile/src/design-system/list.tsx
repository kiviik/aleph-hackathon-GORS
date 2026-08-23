// Every list in the app goes through here. FlashList only — no ScrollView + .map(), and no
// FlatList: virtualisation is the default, even for the short ones.
export {
  FlashList as List,
  type FlashListProps as ListProps,
  type FlashListRef as ListRef,
  type ListRenderItem,
  type ListRenderItemInfo,
} from "@shopify/flash-list";
