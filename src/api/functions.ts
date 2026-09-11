/**
 * Client-callable RPC functions (createServerFn).
 * DB logic lives in *.server.ts and is only used inside handlers.
 * Every private handler requires a session; mutations enforce role/owner.
 */
import { createServerFn } from "@tanstack/react-start";
import type {
  CustomerStatus,
  DiscountType,
  OrderStatus,
  QuoteStatus,
  ProductImageKind,
  ImageRoomTagSlug,
} from "@/lib/types";
import type { Role } from "@/lib/auth-types";
import type { FlatMediaTab, FlatMediaSort } from "@/db/crm.server";
// ─── Auth ───────────────────────────────────────────────────

export const fetchMe = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentUser } = await import("@/db/auth.server");
  return await getCurrentUser();
});

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { loginWithPassword } = await import("@/db/auth.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await loginWithPassword(data.username, data.password);
    if ("error" in result) {
      await writeAudit({
        username: data.username?.trim().toLowerCase() || "",
        action: "login.failed",
        entity_type: "user",
        summary: `Đăng nhập thất bại: ${data.username}`,
      });
      return result;
    }
    await writeAudit({
      user: result.user,
      action: "login",
      entity_type: "user",
      entity_id: result.user.id,
      summary: `${result.user.display_name} đăng nhập`,
    });
    return result;
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const { getCurrentUser, logoutCurrentSession } = await import("@/db/auth.server");
  const { writeAudit } = await import("@/db/audit.server");
  const me = await getCurrentUser();
  await logoutCurrentSession();
  if (me) {
    await writeAudit({
      user: me,
      action: "logout",
      entity_type: "user",
      entity_id: me.id,
      summary: `${me.display_name} đăng xuất`,
    });
  }
  return { ok: true as const };
});

// ─── Public Landing Auth (Supabase Google) ────────────────────

export const authGoogleStart = createServerFn({ method: "POST" })
  .inputValidator((data?: { returnTo?: string; origin?: string }) => data ?? {})
  .handler(async ({ data }) => {
    const { getGoogleOAuthUrl } = await import("@/db/auth-public.server");
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const host = getRequestHeader("host") || "";
    const proto =
      getRequestHeader("x-forwarded-proto") ||
      (host.includes("localhost") ? "http" : "https");
    const headerOrigin = host ? `${proto}://${host}` : "";
    const origin = data?.origin || headerOrigin || "";
    return getGoogleOAuthUrl(data?.returnTo || "/", origin);
  });

export const authGoogleCallback = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      code?: string;
      accessToken?: string;
      returnTo?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { handleSupabaseCallback } = await import("@/db/auth-public.server");
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const userAgent = getRequestHeader("user-agent") || "";
    return await handleSupabaseCallback({
      code: data.code,
      accessToken: data.accessToken,
      userAgent,
      returnTo: data.returnTo,
    });
  });

export const fetchPublicMeFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentPublicUser } = await import("@/db/auth-public.server");
  return await getCurrentPublicUser();
});

export const logoutPublicFn = createServerFn({ method: "POST" }).handler(async () => {
  const { logoutPublicSession } = await import("@/db/auth-public.server");
  await logoutPublicSession();
  return { ok: true as const };
});

// ─── Users (admin) ──────────────────────────────────────────

export const fetchUsers = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/db/auth.server");
  await requireAdmin();
  const { listUsers } = await import("@/db/users.server");
  return await listUsers();
});

export const createUserFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      username: string;
      password: string;
      display_name: string;
      role: Role;
      phone?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { createUserAsync } = await import("@/db/users.server");
    const { writeAudit } = await import("@/db/audit.server");
    const user = await createUserAsync(data);
    await writeAudit({
      user: me,
      action: "user.create",
      entity_type: "user",
      entity_id: user.id,
      summary: `Tạo user ${user.username} (${user.role})`,
    });
    return user;
  });

export const updateUserFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id: number;
      display_name?: string;
      role?: Role;
      is_active?: boolean;
      phone?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { updateUser } = await import("@/db/users.server");
    const { writeAudit } = await import("@/db/audit.server");
    const { id, ...rest } = data;
    const user = await updateUser(id, rest, me);
    await writeAudit({
      user: me,
      action: data.is_active === false ? "user.deactivate" : "user.update",
      entity_type: "user",
      entity_id: user.id,
      summary: `Cập nhật user ${user.username}`,
      meta: rest as Record<string, unknown>,
    });
    return user;
  });

export const resetUserPasswordFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; password: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { resetUserPassword } = await import("@/db/users.server");
    const { writeAudit } = await import("@/db/audit.server");
    await resetUserPassword(data.id, data.password, me);
    await writeAudit({
      user: me,
      action: "user.reset_password",
      entity_type: "user",
      entity_id: data.id,
      summary: `Reset mật khẩu user #${data.id}`,
    });
    return { ok: true as const };
  });

export const assignCustomerOwnerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { customerId: number; ownerId: number }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { assignCustomerOwner } = await import("@/db/users.server");
    const { writeAudit } = await import("@/db/audit.server");
    const { getCustomer } = await import("@/db/crm.server");
    const result = await assignCustomerOwner(data.customerId, data.ownerId);
    const customer = await getCustomer(data.customerId);
    await writeAudit({
      user: me,
      action: "customer.assign_owner",
      entity_type: "customer",
      entity_id: data.customerId,
      summary: `Chuyển KH ${customer?.name ?? "#" + data.customerId} → ${result.owner_name}`,
      meta: {
        previous_owner_id: result.previous_owner_id,
        owner_id: result.owner_id,
      },
    });
    return { ok: true as const, ...result, customer };
  });

/** Kiểm tra SĐT trước khi tạo/sửa — báo sales đang phụ trách nếu trùng. */
export const checkCustomerPhoneFn = createServerFn({ method: "GET" })
  .inputValidator((data: { phone: string; excludeId?: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    await requireUser();
    const { findCustomerByPhone, phoneConflictPayload } = await import("@/db/crm.server");
    const hit = await findCustomerByPhone(data.phone, data.excludeId);
    if (!hit) return { conflict: null as null };
    return { conflict: phoneConflictPayload(hit) };
  });

// ─── Audit ──────────────────────────────────────────────────

export const fetchAuditLogs = createServerFn({ method: "GET" })
  .inputValidator((data?: { limit?: number; userId?: number; action?: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    await requireAdmin();
    const { listAuditLogs } = await import("@/db/audit.server");
    return await listAuditLogs(data);
  });

// ─── Products ───────────────────────────────────────────────

export const fetchProducts = createServerFn({ method: "GET" })
  .inputValidator(
    (data?: { category?: string; search?: string; stockLocation?: string; limit?: number }) => data,
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    await requireUser();
    const { listProducts } = await import("@/db/crm.server");
    return await listProducts(data);
  });

export const fetchProductFieldValues = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      field:
        | "color"
        | "supplier"
        | "category"
        | "surface"
        | "collections"
        | "shape"
        | "material"
        | "size";
      category?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    await requireUser();
    const { listProductFieldValues } = await import("@/db/crm.server");
    return await listProductFieldValues(data.field, data.category);
  });

export const bulkUpdateProductFieldFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      ids: number[];
      field:
        | "color"
        | "supplier"
        | "category"
        | "surface"
        | "collections"
        | "shape"
        | "material"
        | "size";
      value: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { bulkUpdateProductField } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await bulkUpdateProductField(data.ids, data.field, data.value);
    await writeAudit({
      user: me,
      action: "product.bulk_update",
      entity_type: "product",
      summary: `Cập nhật hàng loạt ${data.field}="${data.value}" cho ${data.ids.length} SP`,
    });
    return result;
  });

/** Xóa 1 giá trị gợi ý sai khỏi TẤT CẢ sản phẩm đang dùng nó (set field đó về rỗng) */
export const clearProductFieldValueFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      field:
        | "color"
        | "supplier"
        | "category"
        | "surface"
        | "collections"
        | "shape"
        | "material"
        | "size";
      value: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { clearProductFieldValue } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await clearProductFieldValue(data.field, data.value);
    await writeAudit({
      user: me,
      action: "product.bulk_update",
      entity_type: "product",
      summary: `Xóa gợi ý ${data.field}="${data.value}" khỏi ${result.updated} SP`,
    });
    return result;
  });

export const updateProductFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id: number;
      code?: string;
      name?: string;
      size?: string;
      material?: string;
      surface?: string;
      shape?: string;
      collections?: string;
      category?: string;
      supplier?: string;
      color?: string;
      packing?: string;
      packing_m2?: number | null;
      packing_pcs?: number | null;
      packing_kg?: number | null;
      retail_price?: number;
      trade_price?: number | null;
      b2b_price?: number | null;
      discount_tp?: number | null;
      discount_b2b?: number | null;
      note?: string;
      is_hot?: number;
      is_public?: number;
      featured_rank?: number | null;
      image_path?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { updateProduct } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const { id, ...rest } = data;
    const product = await updateProduct(id, rest);
    await writeAudit({
      user: me,
      action: "product.update",
      entity_type: "product",
      entity_id: id,
      summary: `Cập nhật SP ${product.code}`,
    });
    return product;
  });

export const createProductFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      code: string;
      name?: string;
      size?: string;
      material?: string;
      surface?: string;
      shape?: string;
      collections?: string;
      category?: string;
      supplier?: string;
      color?: string;
      packing?: string;
      packing_m2?: number | null;
      packing_pcs?: number | null;
      packing_kg?: number | null;
      retail_price: number;
      trade_price?: number | null;
      b2b_price?: number | null;
      discount_tp?: number | null;
      discount_b2b?: number | null;
      note?: string;
      is_hot?: number;
      is_public?: number;
      featured_rank?: number | null;
      image_path?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { createProduct } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const product = await createProduct(data);
    await writeAudit({
      user: me,
      action: "product.create",
      entity_type: "product",
      entity_id: product.id,
      summary: `Tạo SP ${product.code}`,
    });
    return product;
  });

export const deleteProductFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { deleteProduct } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await deleteProduct(data.id);
    await writeAudit({
      user: me,
      action: "product.delete",
      entity_type: "product",
      entity_id: data.id,
      summary: `Xóa SP ${result.code}`,
    });
    return result;
  });

export const fetchProductImages = createServerFn({ method: "GET" })
  .inputValidator((data: { productId: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    await requireUser();
    const { listProductImages } = await import("@/db/crm.server");
    return await listProductImages(data.productId);
  });

export const uploadProductImageFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      product_id: number;
      filename: string;
      dataBase64: string;
      mimeType?: string;
      caption?: string;
      is_primary?: boolean;
      kind?: import("@/lib/types").ProductImageKind;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { uploadProductImageFile } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const row = await uploadProductImageFile(data);
    await writeAudit({
      user: me,
      action: "product.image.upload",
      entity_type: "product",
      entity_id: data.product_id,
      summary: `Upload ảnh SP #${data.product_id}`,
    });
    return row;
  });

export const addProductImageByPathFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      product_id: number;
      path: string;
      caption?: string;
      is_primary?: boolean;
      kind?: import("@/lib/types").ProductImageKind;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { addProductImage } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const row = await addProductImage(data);
    await writeAudit({
      user: me,
      action: "product.image.add",
      entity_type: "product",
      entity_id: data.product_id,
      summary: `Thêm ảnh path SP #${data.product_id}`,
    });
    return row;
  });

export const setPrimaryProductImageFn = createServerFn({ method: "POST" })
  .inputValidator((data: { productId: number; imageId: number }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    await requireAdmin();
    const { setPrimaryProductImage } = await import("@/db/crm.server");
    return await setPrimaryProductImage(data.productId, data.imageId);
  });

export const setProductImageKindFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      productId: number;
      imageId: number;
      kind: import("@/lib/types").ProductImageKind;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { setProductImageKind } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const rows = await setProductImageKind(data.productId, data.imageId, data.kind);
    await writeAudit({
      user: me,
      action: "product.image.kind",
      entity_type: "product",
      entity_id: data.productId,
      summary: `Gán loại ảnh #${data.imageId} → ${data.kind}`,
    });
    return rows;
  });

export const fetchProductImageRoomTagsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { imageId: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    await requireUser();
    const { listProductImageRoomTags } = await import("@/db/crm.server");
    return await listProductImageRoomTags(data.imageId);
  });

export const setProductImageRoomTagsFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      productId: number;
      imageId: number;
      roomSlugs: ImageRoomTagSlug[];
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { setProductImageRoomTags } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const rows = await setProductImageRoomTags(data.productId, data.imageId, data.roomSlugs);
    await writeAudit({
      user: me,
      action: "product.image.room_tags",
      entity_type: "product_image",
      entity_id: data.imageId,
      summary: `Gán bối cảnh ảnh #${data.imageId}`,
      meta: { room_slugs: data.roomSlugs },
    });
    return rows;
  });

export const deleteProductImageFn = createServerFn({ method: "POST" })
  .inputValidator((data: { imageId: number }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { deleteProductImage } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await deleteProductImage(data.imageId);
    await writeAudit({
      user: me,
      action: "product.image.delete",
      entity_type: "product",
      entity_id: data.imageId,
      summary: `Xóa ảnh #${data.imageId}`,
    });
    return result;
  });

// ─── Gallery ───────────────────────────────────────────────────────────────

export const fetchGalleryCollections = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUser } = await import("@/db/auth.server");
  await requireUser();
  const { listGalleryCollections } = await import("@/db/gallery.server");
  return await listGalleryCollections();
});

export const fetchGalleryCollection = createServerFn({ method: "GET" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    await requireUser();
    const { getGalleryCollection } = await import("@/db/gallery.server");
    return await getGalleryCollection(data.id);
  });

export const fetchGalleryImageCandidates = createServerFn({ method: "GET" })
  .inputValidator((data?: { kind?: import("@/lib/types").ProductImageKind }) => data ?? {})
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    await requireUser();
    const { listGalleryImageCandidates } = await import("@/db/gallery.server");
    return await listGalleryImageCandidates(data);
  });

export const createGalleryCollectionFn = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; description?: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { createGalleryCollection } = await import("@/db/gallery.server");
    const { writeAudit } = await import("@/db/audit.server");
    const collection = await createGalleryCollection({ ...data, createdBy: me.id });
    await writeAudit({
      user: me,
      action: "gallery.create",
      entity_type: "gallery_collection",
      entity_id: collection.id,
      summary: `Tạo bộ sưu tập ${collection.name}`,
    });
    return collection;
  });

export const updateGalleryCollectionFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; name: string; description?: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { updateGalleryCollection } = await import("@/db/gallery.server");
    const { writeAudit } = await import("@/db/audit.server");
    const collection = await updateGalleryCollection(data);
    await writeAudit({
      user: me,
      action: "gallery.update",
      entity_type: "gallery_collection",
      entity_id: collection.id,
      summary: `Cập nhật bộ sưu tập ${collection.name}`,
    });
    return collection;
  });

export const addGalleryProductImagesFn = createServerFn({ method: "POST" })
  .inputValidator((data: { collectionId: number; productImageIds: number[] }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { addGalleryProductImages } = await import("@/db/gallery.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await addGalleryProductImages(data);
    await writeAudit({
      user: me,
      action: "gallery.items.add",
      entity_type: "gallery_collection",
      entity_id: data.collectionId,
      summary: `Thêm ${result.added} ảnh sản phẩm vào bộ sưu tập`,
    });
    return result;
  });

export const uploadGalleryImageFn = createServerFn({ method: "POST" })
  .inputValidator((data: { collectionId: number; dataBase64: string; caption?: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { uploadGalleryImage } = await import("@/db/gallery.server");
    const { writeAudit } = await import("@/db/audit.server");
    const item = await uploadGalleryImage(data);
    await writeAudit({
      user: me,
      action: "gallery.image.upload",
      entity_type: "gallery_collection",
      entity_id: data.collectionId,
      summary: "Upload ảnh riêng vào bộ sưu tập",
    });
    return item;
  });

export const setGalleryCoverFn = createServerFn({ method: "POST" })
  .inputValidator((data: { collectionId: number; itemId: number }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { setGalleryCover } = await import("@/db/gallery.server");
    const { writeAudit } = await import("@/db/audit.server");
    const collection = await setGalleryCover(data);
    await writeAudit({
      user: me,
      action: "gallery.cover.set",
      entity_type: "gallery_collection",
      entity_id: data.collectionId,
      summary: `Đặt ảnh đại diện cho ${collection.name}`,
    });
    return collection;
  });

export const reorderGalleryItemsFn = createServerFn({ method: "POST" })
  .inputValidator((data: { collectionId: number; itemIds: number[] }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { reorderGalleryItems } = await import("@/db/gallery.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await reorderGalleryItems(data);
    await writeAudit({
      user: me,
      action: "gallery.items.reorder",
      entity_type: "gallery_collection",
      entity_id: data.collectionId,
      summary: `Sắp xếp ${data.itemIds.length} ảnh trong bộ sưu tập`,
    });
    return result;
  });

export const removeGalleryItemFn = createServerFn({ method: "POST" })
  .inputValidator((data: { itemId: number }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { removeGalleryItem } = await import("@/db/gallery.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await removeGalleryItem(data.itemId);
    await writeAudit({
      user: me,
      action: "gallery.item.remove",
      entity_type: "gallery_collection",
      entity_id: result.collectionId,
      summary: "Gỡ ảnh khỏi bộ sưu tập",
    });
    return result;
  });

export const deleteGalleryCollectionFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { deleteGalleryCollection } = await import("@/db/gallery.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await deleteGalleryCollection(data.id);
    await writeAudit({
      user: me,
      action: "gallery.delete",
      entity_type: "gallery_collection",
      entity_id: data.id,
      summary: `Xóa bộ sưu tập ${result.name}`,
    });
    return result;
  });

// ─── Customers ──────────────────────────────────────────────

export const fetchCustomers = createServerFn({ method: "GET" })
  .inputValidator(
    (data?: {
      status?: CustomerStatus | "all";
      search?: string;
      /** Mặc định 500; dialog chọn KH nên truyền 100–200. */
      limit?: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireUser, ownerFilter } = await import("@/db/auth.server");
    const me = await requireUser();
    const { listCustomers } = await import("@/db/crm.server");
    return await listCustomers(data?.status, ownerFilter(me), {
      search: data?.search,
      limit: data?.limit,
    });
  });

// ─── Customer mappings (mapping mẫu gạch theo KH) ─────────────

export const fetchCustomerMappings = createServerFn({ method: "GET" })
  .inputValidator((data: { customerId: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    await assertCanAccessCustomer(me, data.customerId);
    const { listCustomerMappings } = await import("@/db/crm.server");
    return await listCustomerMappings(data.customerId);
  });

export const uploadMappingImageFn = createServerFn({ method: "POST" })
  .inputValidator((data: { filename: string; dataBase64: string; mimeType?: string }) => data)
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    const me = await requireUser();
    const { uploadMappingImageFile } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const res = await uploadMappingImageFile(data);
    await writeAudit({
      user: me,
      action: "mapping.image.upload",
      entity_type: "customer",
      summary: "Upload ảnh khu vực mapping",
    });
    return res;
  });

export const saveCustomerMappingFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id?: number;
      customer_id: number;
      name?: string;
      version?: string;
      note?: string;
      price_basis?: string;
      items?: Array<{
        description?: string;
        size?: string;
        product_id?: number | null;
        image_path?: string;
        sort_order?: number;
        area_group_key?: string;
        custom_product_code?: string;
        custom_product_name?: string;
        custom_product_size?: string;
        custom_product_surface?: string;
        custom_product_retail_price?: number;
        custom_product_image_path?: string;
        price_override?: number | null;
      }>;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    await assertCanAccessCustomer(me, data.customer_id);
    const { saveCustomerMapping } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const mapping = await saveCustomerMapping(data);
    await writeAudit({
      user: me,
      action: "mapping.save",
      entity_type: "customer",
      entity_id: data.customer_id,
      summary: `Lưu mapping "${mapping.name}" cho KH #${data.customer_id}`,
    });
    return mapping;
  });

export const deleteCustomerMappingFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    const me = await requireUser();
    const { deleteCustomerMapping } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const res = await deleteCustomerMapping(data.id);
    await writeAudit({
      user: me,
      action: "mapping.delete",
      entity_type: "customer",
      summary: `Xóa mapping #${data.id}`,
    });
    return res;
  });

export const exportMappingPrintFn = createServerFn({ method: "POST" })
  .inputValidator((data: { mappingId: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    const { exportMappingToHtml, getMappingCustomerId } =
      await import("@/db/export-mapping.server");
    const customerId = await getMappingCustomerId(data.mappingId);
    if (customerId == null) throw new Error("Không tìm thấy mapping");
    await assertCanAccessCustomer(me, customerId);
    const result = await exportMappingToHtml(data.mappingId);
    const { writeAudit } = await import("@/db/audit.server");
    await writeAudit({
      user: me,
      action: "mapping.export",
      entity_type: "customer",
      entity_id: customerId,
      summary: `Xuất mapping #${data.mappingId}`,
    });
    return result;
  });

export const createQuoteFromMappingFn = createServerFn({ method: "POST" })
  .inputValidator((data: { mappingId: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    const { getCustomerMappingCustomerId, createQuoteFromCustomerMapping } =
      await import("@/db/crm.server");
    const customerId = await getCustomerMappingCustomerId(data.mappingId);
    if (customerId == null) throw new Error("Không tìm thấy đề xuất vật liệu");
    await assertCanAccessCustomer(me, customerId);
    const quote = await createQuoteFromCustomerMapping(data.mappingId);
    const { writeAudit } = await import("@/db/audit.server");
    await writeAudit({
      user: me,
      action: "quote.create.from_mapping",
      entity_type: "quote",
      entity_id: quote.id,
      summary: `Tạo ${quote.code} từ đề xuất #${data.mappingId}`,
    });
    return quote;
  });

export const saveCustomer = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      name: string;
      source?: string;
      phone?: string;
      email?: string;
      company?: string;
      short_name?: string;
      region?: string;
      status?: CustomerStatus;
      note?: string;
      owner_id?: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    if (!data.name?.trim()) throw new Error("Tên khách hàng bắt buộc");
    const { requireUser } = await import("@/db/auth.server");
    const me = await requireUser();
    const { createCustomer } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const ownerId = me.role === "admin" && data.owner_id ? data.owner_id : me.id;
    const customer = await createCustomer({ ...data, owner_id: ownerId });
    await writeAudit({
      user: me,
      action: "customer.create",
      entity_type: "customer",
      entity_id: customer.id,
      summary: `Tạo KH ${customer.name}`,
    });
    return customer;
  });

export const updateCustomerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id: number;
      name?: string;
      source?: string;
      phone?: string;
      email?: string;
      company?: string;
      short_name?: string;
      region?: string;
      status?: CustomerStatus;
      note?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    await assertCanAccessCustomer(me, data.id);
    const { updateCustomer } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const { id, ...rest } = data;
    const customer = await updateCustomer(id, rest);
    await writeAudit({
      user: me,
      action: "customer.update",
      entity_type: "customer",
      entity_id: id,
      summary: `Cập nhật KH ${customer.name}`,
    });
    return customer;
  });

export const setCustomerStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; status: CustomerStatus }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    await assertCanAccessCustomer(me, data.id);
    const { updateCustomerStatus } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const customer = await updateCustomerStatus(data.id, data.status);
    await writeAudit({
      user: me,
      action: "customer.status",
      entity_type: "customer",
      entity_id: data.id,
      summary: `Đổi trạng thái KH #${data.id} → ${data.status}`,
    });
    return customer;
  });

export const fetchCustomerDetail = createServerFn({ method: "GET" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    await assertCanAccessCustomer(me, data.id);
    const { getCustomerDetail } = await import("@/db/crm.server");
    return await getCustomerDetail(data.id);
  });

/** Thêm nhanh 1 SP vào tab "SP đã báo" của KH (không cần tạo báo giá) */
export const addManualCustomerProductFn = createServerFn({ method: "POST" })
  .inputValidator((data: { customer_id: number; product_id: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    await assertCanAccessCustomer(me, data.customer_id);
    const { addManualCustomerProduct } = await import("@/db/crm.server");
    return await addManualCustomerProduct({
      customer_id: data.customer_id,
      product_id: data.product_id,
    });
  });

/** Tick/bỏ tick "Đã gửi mẫu" cho 1 dòng SP đã báo (áp dụng cả SP từ báo giá + add tay) */
export const setCustomerProductSampleSentFn = createServerFn({
  method: "POST",
})
  .inputValidator((data: { id: number; sample_sent: boolean }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    const { getCustomerProductSampleCustomerId } = await import("@/db/crm.server");
    const customerId = await getCustomerProductSampleCustomerId(data.id);
    if (customerId != null) await assertCanAccessCustomer(me, customerId);
    const { setCustomerProductSampleSent } = await import("@/db/crm.server");
    return await setCustomerProductSampleSent(data.id, data.sample_sent);
  });

/** Xóa 1 dòng SP khỏi tab "SP đã báo" (lỡ thêm sai) — không xóa quote/quote_items gốc */
export const deleteCustomerProductSampleFn = createServerFn({
  method: "POST",
})
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    const { getCustomerProductSampleCustomerId } = await import("@/db/crm.server");
    const customerId = await getCustomerProductSampleCustomerId(data.id);
    if (customerId != null) await assertCanAccessCustomer(me, customerId);
    const { deleteCustomerProductSample } = await import("@/db/crm.server");
    return await deleteCustomerProductSample(data.id);
  });

/** Chỉ admin — xóa KH + báo giá, đơn, thanh toán, ghi chú liên quan */
export const deleteCustomerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { deleteCustomer } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await deleteCustomer(data.id);
    await writeAudit({
      user: me,
      action: "customer.delete",
      entity_type: "customer",
      entity_id: data.id,
      summary: `Xóa KH ${result.name} (+${result.quotes} BG, ${result.orders} ĐH, ${result.payments} TT)`,
      meta: {
        quotes: result.quotes,
        orders: result.orders,
        payments: result.payments,
        notes: result.notes,
      },
    });
    return result;
  });

// ─── Quotes ─────────────────────────────────────────────────

export const fetchQuotes = createServerFn({ method: "GET" })
  .inputValidator(
    (data?: {
      search?: string;
      statuses?: QuoteStatus[];
      limit?: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireUser, ownerFilter } = await import("@/db/auth.server");
    const me = await requireUser();
    const { listQuotes } = await import("@/db/crm.server");
    return await listQuotes(ownerFilter(me), {
      search: data?.search,
      statuses: data?.statuses,
      limit: data?.limit,
    });
  });

export const fetchQuote = createServerFn({ method: "GET" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    const { getQuote, getQuoteItems } = await import("@/db/crm.server");
    const quote = await getQuote(data.id);
    if (!quote) return null;
    await assertCanAccessCustomer(me, quote.customer_id);
    const { getDb } = await import("@/db/index.server");
    const sourceMapping = (await getDb()
      .prepare(
        `SELECT m.id, m.code, m.name
         FROM customer_mapping_quote_links l
         JOIN customer_mappings m ON m.id = l.mapping_id
         WHERE l.quote_id = ? LIMIT 1`,
      )
      .get(data.id)) as { id: number; code: string; name: string } | undefined;
    return {
      quote,
      items: await getQuoteItems(data.id),
      source_mapping: sourceMapping ?? null,
    };
  });

export const saveQuote = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      customer_id: number;
      discount_type?: DiscountType;
      notes?: string;
      prices_include_vat?: boolean;
      shipping_fee?: number;
      items: Array<{
        product_id: number;
        quantity_m2: number;
        discount_pct?: number;
        unit_price?: number | null;
        product_name?: string;
        product_code?: string;
        area?: string;
      }>;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    await assertCanAccessCustomer(me, data.customer_id);
    const { createQuote } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const quote = await createQuote(data);
    await writeAudit({
      user: me,
      action: "quote.create",
      entity_type: "quote",
      entity_id: quote.id,
      summary: `Tạo báo giá ${quote.code}`,
    });
    return quote;
  });

export const updateQuoteFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id: number;
      customer_id: number;
      status?: QuoteStatus;
      discount_type?: DiscountType;
      notes?: string;
      prices_include_vat?: boolean;
      shipping_fee?: number;
      items: Array<{
        product_id: number;
        quantity_m2: number;
        discount_pct?: number;
        unit_price?: number | null;
        product_name?: string;
        product_code?: string;
        area?: string;
      }>;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    await assertCanAccessCustomer(me, data.customer_id);
    const { updateQuote } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const quote = await updateQuote(data);
    await writeAudit({
      user: me,
      action: "quote.update",
      entity_type: "quote",
      entity_id: quote.id,
      summary: `Cập nhật báo giá ${quote.code}`,
    });
    return quote;
  });

export const deleteQuoteFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    const { getQuote, deleteQuote } = await import("@/db/crm.server");
    const quote = await getQuote(data.id);
    if (!quote) throw new Error("Không tìm thấy báo giá");
    await assertCanAccessCustomer(me, quote.customer_id);
    const result = await deleteQuote(data.id);
    const { writeAudit } = await import("@/db/audit.server");
    await writeAudit({
      user: me,
      action: "quote.delete",
      entity_type: "quote",
      entity_id: data.id,
      summary:
        `Xóa báo giá ${result.code}` +
        (result.orders_deleted
          ? ` (+${result.orders_deleted} đơn, ${result.payments_deleted} TT)`
          : ""),
      meta: {
        orders_deleted: result.orders_deleted,
        payments_deleted: result.payments_deleted,
      },
    });
    return result;
  });

// ─── Orders ─────────────────────────────────────────────────

export const fetchOrders = createServerFn({ method: "GET" })
  .inputValidator(
    (data?: {
      search?: string;
      statuses?: OrderStatus[];
      limit?: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireUser, ownerFilter } = await import("@/db/auth.server");
    const me = await requireUser();
    const { listOrders } = await import("@/db/crm.server");
    return await listOrders(ownerFilter(me), {
      search: data?.search,
      statuses: data?.statuses,
      limit: data?.limit,
    });
  });

export const setOrderStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; status: OrderStatus }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    const { getOrder, updateOrderStatus } = await import("@/db/crm.server");
    const existing = await getOrder(data.id);
    if (!existing) throw new Error("Không tìm thấy đơn hàng");
    await assertCanAccessCustomer(me, existing.customer_id);
    const order = await updateOrderStatus(data.id, data.status);
    const { writeAudit } = await import("@/db/audit.server");
    await writeAudit({
      user: me,
      action: "order.status",
      entity_type: "order",
      entity_id: order.id,
      summary: `Đổi trạng thái đơn ${order.code} → ${data.status}`,
    });
    return order;
  });

export const deleteOrderFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    const { getOrder, deleteOrder } = await import("@/db/crm.server");
    const existing = await getOrder(data.id);
    if (!existing) throw new Error("Không tìm thấy đơn hàng");
    await assertCanAccessCustomer(me, existing.customer_id);
    const result = await deleteOrder(data.id);
    const { writeAudit } = await import("@/db/audit.server");
    await writeAudit({
      user: me,
      action: "order.delete",
      entity_type: "order",
      entity_id: data.id,
      summary:
        `Xóa đơn ${result.code}` +
        (result.payments_deleted ? ` (+${result.payments_deleted} TT)` : ""),
      meta: { payments_deleted: result.payments_deleted },
    });
    return result;
  });

export const convertQuoteToOrder = createServerFn({ method: "POST" })
  .inputValidator((data: { quoteId: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    const { getQuote, createOrderFromQuote } = await import("@/db/crm.server");
    const quote = await getQuote(data.quoteId);
    if (!quote) throw new Error("Không tìm thấy báo giá");
    await assertCanAccessCustomer(me, quote.customer_id);
    const { writeAudit } = await import("@/db/audit.server");
    const order = await createOrderFromQuote(data.quoteId);
    await writeAudit({
      user: me,
      action: "order.convert",
      entity_type: "order",
      entity_id: order.id,
      summary: `Chuyển BG ${quote.code} → ĐH ${order.code}`,
    });
    return order;
  });

// ─── Debt & payments ────────────────────────────────────────

export const fetchCustomerDebts = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUser, ownerFilter } = await import("@/db/auth.server");
  const me = await requireUser();
  const { listCustomerDebts } = await import("@/db/crm.server");
  return await listCustomerDebts(ownerFilter(me));
});

export const fetchCustomerDebtDetail = createServerFn({ method: "GET" })
  .inputValidator((data: { customerId: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer, ownerFilter } = await import("@/db/auth.server");
    const me = await requireUser();
    await assertCanAccessCustomer(me, data.customerId);
    const { getCustomerDebtDetail } = await import("@/db/crm.server");
    return await getCustomerDebtDetail(data.customerId, ownerFilter(me));
  });

export const savePayment = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      customer_id: number;
      amount: number;
      order_id?: number | null;
      paid_at?: string;
      note?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    await assertCanAccessCustomer(me, data.customer_id);
    const { addPayment } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const payment = await addPayment(data);
    await writeAudit({
      user: me,
      action: "payment.create",
      entity_type: "payment",
      entity_id: payment.id,
      summary: `Thu ${payment.amount} từ KH #${data.customer_id}`,
    });
    return payment;
  });

/** Sửa thanh toán (chỉ admin) — dùng khi nhập sai số tiền/ngày/ghi chú. */
export const updatePaymentFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id: number;
      amount?: number;
      order_id?: number | null;
      paid_at?: string;
      note?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { getPayment, updatePayment } = await import("@/db/crm.server");
    const before = await getPayment(data.id);
    if (!before) throw new Error("Không tìm thấy thanh toán");
    const { writeAudit } = await import("@/db/audit.server");
    const { id, ...rest } = data;
    const payment = await updatePayment(id, rest);
    await writeAudit({
      user: me,
      action: "payment.update",
      entity_type: "payment",
      entity_id: payment.id,
      summary: `Sửa thanh toán #${payment.id} KH #${payment.customer_id}: ${before.amount} → ${payment.amount}`,
    });
    return payment;
  });

/** Xóa thanh toán (chỉ admin) — dùng khi nhập nhầm. */
export const deletePaymentFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { getPayment, deletePayment } = await import("@/db/crm.server");
    const before = await getPayment(data.id);
    if (!before) throw new Error("Không tìm thấy thanh toán");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await deletePayment(data.id);
    await writeAudit({
      user: me,
      action: "payment.delete",
      entity_type: "payment",
      entity_id: data.id,
      summary: `Xóa thanh toán #${data.id} (${before.amount}) KH #${before.customer_id}`,
    });
    return result;
  });

// ─── Notes ──────────────────────────────────────────────────

export const fetchNotes = createServerFn({ method: "GET" })
  .inputValidator((data?: { limit?: number }) => data)
  .handler(async ({ data }) => {
    const { requireUser, ownerFilter } = await import("@/db/auth.server");
    const me = await requireUser();
    const { listNotes } = await import("@/db/crm.server");
    return await listNotes(data?.limit ?? 50, ownerFilter(me));
  });

export const saveNote = createServerFn({ method: "POST" })
  .inputValidator((data: { content: string; customer_id?: number | null; author?: string }) => data)
  .handler(async ({ data }) => {
    if (!data.content?.trim()) throw new Error("Nội dung ghi chú bắt buộc");
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    if (data.customer_id) {
      await assertCanAccessCustomer(me, data.customer_id);
    }
    const { createNote } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const note = await createNote({
      content: data.content,
      customer_id: data.customer_id,
      author: me.display_name,
      author_user_id: me.id,
    });
    await writeAudit({
      user: me,
      action: "note.create",
      entity_type: "note",
      entity_id: note.id,
      summary: `Ghi chú #${note.id}`,
    });
    return note;
  });

// ─── Dashboard ──────────────────────────────────────────────

export const fetchDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUser, ownerFilter } = await import("@/db/auth.server");
  const me = await requireUser();
  const { getDashboardStats } = await import("@/db/crm.server");
  return await getDashboardStats(ownerFilter(me));
});

/** Xuất catalog SP ra Excel */
export const exportProductsXlsxFn = createServerFn({ method: "POST" })
  .inputValidator((data?: { category?: string }) => data ?? {})
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { exportProductsXlsx } = await import("@/db/product-import-export.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await exportProductsXlsx({ category: data?.category });
    await writeAudit({
      user: me,
      action: "product.export",
      entity_type: "product",
      summary: `Xuất Excel sản phẩm (${result.filename})`,
    });
    return result;
  });

/** Xem trước import SP (upsert theo code) — items = rows object từ Excel */
export const previewProductImportFn = createServerFn({ method: "POST" })
  .inputValidator((data: { items: Array<Record<string, unknown>> }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    await requireAdmin();
    const { parseProductImportRows, previewProductImport } =
      await import("@/db/product-import-export.server");
    const rows = parseProductImportRows(data.items ?? []);
    return await previewProductImport(rows);
  });

/** Áp dụng import SP sau verify */
export const importProductsFn = createServerFn({ method: "POST" })
  .inputValidator((data: { items: Array<Record<string, unknown>> }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { parseProductImportRows, applyProductImport } =
      await import("@/db/product-import-export.server");
    const { writeAudit } = await import("@/db/audit.server");
    const rows = parseProductImportRows(data.items ?? []);
    const result = await applyProductImport(rows);
    await writeAudit({
      user: me,
      action: "product.import",
      entity_type: "product",
      summary: `Import SP: +${result.created} mới, ~${result.updated} cập nhật, ${result.errors.length} lỗi`,
    });
    return result;
  });

/** Xuất báo giá thành file HTML in A4 ngang (mở tab mới để in / lưu PDF). */
export const exportQuotePrintFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      quoteId: number;
      paymentTerms?: string;
      deliveryTerms?: string;
      hideVat?: boolean;
      showOrigin?: boolean;
      showColorVariance?: boolean;
      projectName?: string;
      deliveryLocation?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireUser, assertCanAccessCustomer } = await import("@/db/auth.server");
    const me = await requireUser();
    const { getQuote } = await import("@/db/crm.server");
    const quote = await getQuote(data.quoteId);
    if (!quote) throw new Error("Không tìm thấy báo giá");
    await assertCanAccessCustomer(me, quote.customer_id);
    const { exportQuoteToHtml } = await import("@/db/export-quote.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await exportQuoteToHtml(
      data.quoteId,
      data.paymentTerms || "",
      data.deliveryTerms || "",
      data.hideVat || false,
      data.showOrigin || false,
      data.showColorVariance || false,
      data.projectName || "",
      data.deliveryLocation || "",
    );
    await writeAudit({
      user: me,
      action: "quote.export",
      entity_type: "quote",
      entity_id: data.quoteId,
      summary: `In báo giá ${quote.code}`,
    });
    return result;
  });

export const exportInternalCodesXlsxFn = createServerFn({ method: "POST" }).handler(async () => {
  const { exportInternalCodesXlsx } = await import("@/db/product-import-export.server");
  return await exportInternalCodesXlsx();
});
export const importInternalCodeMappingFn = createServerFn({ method: "POST" })
  .inputValidator((data: { items: Array<{ internal_code: string; product_code: string }> }) => data)
  .handler(async ({ data }) => {
    const { getDb } = await import("@/db/index.server");
    const db = getDb();
    let added = 0;
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO product_internal_codes (product_id, internal_code)
      SELECT id, ? FROM products WHERE code = ?
    `);
    await db.transaction(async () => {
      for (const item of data.items) {
        try {
          const res = await stmt.run(item.internal_code, item.product_code);
          added += res.changes;
        } catch (err: unknown) {
          if (err instanceof Error && err.message.includes("FOREIGN KEY constraint failed")) {
            console.warn("Skipping invalid product_code:", item.product_code);
          } else {
            throw err;
          }
        }
      }
    })();
    return { added };
  });

export const syncProductInternalCodesFn = createServerFn({ method: "POST" })
  .inputValidator((data: { product_id: number; internal_codes: string[] }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    await requireAdmin();
    const { getDb } = await import("@/db/index.server");
    const { parseInternalCodesList } = await import("@/lib/product-internal-codes");
    const codes = parseInternalCodesList(...data.internal_codes);
    const db = getDb();
    if (codes.length) {
      const placeholders = codes.map(() => "?").join(", ");
      const clash = await db
        .prepare(
          `SELECT pic.internal_code, p.code product_code FROM product_internal_codes pic
         JOIN products p ON p.id = pic.product_id
         WHERE UPPER(pic.internal_code) IN (${placeholders}) AND pic.product_id != ? LIMIT 1`,
        )
        .get<{ internal_code: string; product_code: string }>(
          ...codes.map((code) => code.toUpperCase()),
          data.product_id,
        );
      if (clash)
        throw new Error(`Mã nội bộ ${clash.internal_code} đã thuộc sản phẩm ${clash.product_code}`);
    }
    await db.transaction(async (tx) => {
      if (codes.length) {
        const placeholders = codes.map(() => "?").join(", ");
        await tx
          .prepare(
            `DELETE FROM product_internal_codes
           WHERE product_id = ? AND UPPER(internal_code) NOT IN (${placeholders})`,
          )
          .run(data.product_id, ...codes.map((code) => code.toUpperCase()));
      } else {
        await tx
          .prepare("DELETE FROM product_internal_codes WHERE product_id = ?")
          .run(data.product_id);
      }
      const insert = tx.prepare(
        "INSERT OR IGNORE INTO product_internal_codes (product_id, internal_code) VALUES (?, ?)",
      );
      for (const code of codes) await insert.run(data.product_id, code);
    })();
    return { internal_codes: codes };
  });

export const importStockUpdateFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      items: Array<{
        internal_code: string;
        stock_location: string;
        quantity: number;
      }>;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    await requireAdmin();
    const { getDb } = await import("@/db/index.server");
    const db = getDb();
    const normalized = new Map<
      string,
      {
        internal_code: string;
        stock_location: string;
        quantity: number;
      }
    >();
    let skipped = 0;

    for (const item of data.items ?? []) {
      const internal_code = String(item.internal_code ?? "").trim();
      const stock_location = String(item.stock_location ?? "").trim();
      if (!internal_code || !stock_location) {
        skipped++;
        continue;
      }
      const rawQuantity = Number(item.quantity);
      const quantity = Number.isFinite(rawQuantity) ? Math.max(0, rawQuantity) : 0;
      // File MISA có thể chứa trùng mã/kho; giữ dòng cuối cùng như import tuần tự cũ.
      normalized.set(`${internal_code}|${stock_location}`, {
        internal_code,
        stock_location,
        quantity,
      });
    }

    const rows = [...normalized.values()];
    const CHUNK_SIZE = 500;
    let updated = 0;
    const runTx = db.transaction(async (tx) => {
      for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
        const chunk = rows.slice(offset, offset + CHUNK_SIZE);
        const codePlaceholders = chunk.map(() => "?").join(", ");
        const mappedRows = (await tx
          .prepare(
            `SELECT internal_code FROM product_internal_codes
             WHERE internal_code IN (${codePlaceholders})`,
          )
          .all<{ internal_code: string }>(...chunk.map((row) => row.internal_code))) as Array<{
          internal_code: string;
        }>;
        const mapped = new Set(mappedRows.map((row) => row.internal_code));
        const valid = chunk.filter((row) => mapped.has(row.internal_code));
        skipped += chunk.length - valid.length;
        if (!valid.length) continue;

        const valuePlaceholders = valid.map(() => "(?, ?, ?)").join(", ");
        const result = await tx
          .prepare(
            `INSERT INTO inventory (internal_code, stock_location, quantity_stock)
             VALUES ${valuePlaceholders}
             ON CONFLICT(internal_code, stock_location)
             DO UPDATE SET quantity_stock = excluded.quantity_stock`,
          )
          .run(...valid.flatMap((row) => [row.internal_code, row.stock_location, row.quantity]));
        updated += Number(result.changes) || 0;
      }
    });
    return { updated, skipped };
  });

export const fetchFlatMediaImagesFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data?: {
      tab?: FlatMediaTab;
      category?: string;
      search?: string;
      roomSlug?: ImageRoomTagSlug;
      publicFilter?: "all" | "public" | "hidden";
      colors?: string[];
      shapes?: string[];
      collections?: string[];
      sort?: FlatMediaSort;
      page?: number;
      pageSize?: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/db/auth.server");
    await requireUser();
    const { listFlatMediaImages } = await import("@/db/crm.server");
    return await listFlatMediaImages(data);
  });

export const bulkSetProductImageKindFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      imageIds: number[];
      kind: ProductImageKind;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { bulkSetProductImageKind } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await bulkSetProductImageKind(data.imageIds, data.kind);
    await writeAudit({
      user: me,
      action: "product.image.bulk_kind",
      entity_type: "product_image",
      summary: `Gán loại ${data.kind} cho ${result.updated} ảnh sản phẩm`,
      meta: { image_ids: data.imageIds, kind: data.kind, updated: result.updated },
    });
    return result;
  });

export const setImageRoomTagsDirectFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      imageId: number;
      roomSlugs: ImageRoomTagSlug[];
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { setImageRoomTagsDirect } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const tags = await setImageRoomTagsDirect(data.imageId, data.roomSlugs);
    await writeAudit({
      user: me,
      action: "product.image.room_tags_direct",
      entity_type: "product_image",
      entity_id: data.imageId,
      summary: `Cập nhật bối cảnh cho ảnh #${data.imageId}`,
      meta: { image_id: data.imageId, room_slugs: data.roomSlugs },
    });
    return tags;
  });

export const bulkSetProductImageRoomTagsFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      imageIds: number[];
      roomSlugs: ImageRoomTagSlug[];
      mode?: "replace" | "add" | "remove";
    }) => data,
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/db/auth.server");
    const me = await requireAdmin();
    const { bulkSetProductImageRoomTags } = await import("@/db/crm.server");
    const { writeAudit } = await import("@/db/audit.server");
    const result = await bulkSetProductImageRoomTags(data.imageIds, data.roomSlugs, data.mode);
    await writeAudit({
      user: me,
      action: "product.image.bulk_room_tags",
      entity_type: "product_image",
      summary: `Cập nhật bối cảnh hàng loạt cho ${result.updated} ảnh`,
      meta: { image_ids: data.imageIds, room_slugs: data.roomSlugs, mode: data.mode },
    });
    return result;
  });
