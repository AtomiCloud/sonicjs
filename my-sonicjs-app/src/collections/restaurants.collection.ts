import type { CollectionConfig } from '@sonicjs-cms/core'

const serviceModesField = {
  type: 'array' as const,
  title: 'Service Modes',
  items: {
    type: 'string' as const,
    title: 'Mode',
  },
}

const socialLinkField = {
  type: 'object' as const,
  properties: {
    label: { type: 'string' as const, title: 'Label', required: true },
    url: { type: 'url' as const, title: 'URL', required: true },
  },
}

const menuItemField = {
  type: 'object' as const,
  properties: {
    name: { type: 'string' as const, title: 'Name', required: true },
    description: { type: 'textarea' as const, title: 'Description' },
    price: { type: 'number' as const, title: 'Price' },
    currency: { type: 'string' as const, title: 'Currency' },
  },
}

const menuSectionField = {
  type: 'object' as const,
  properties: {
    title: { type: 'string' as const, title: 'Section Title', required: true },
    items: {
      type: 'array' as const,
      title: 'Items',
      items: menuItemField,
    },
  },
}

const menuField = {
  type: 'object' as const,
  properties: {
    title: { type: 'string' as const, title: 'Menu Title', required: true },
    sections: {
      type: 'array' as const,
      title: 'Sections',
      items: menuSectionField,
    },
  },
}

const restaurantCollection: CollectionConfig = {
  name: 'restaurants',
  displayName: 'Restaurants',
  description: 'Tenant-scoped restaurant profiles and menus ingested from external sources',
  icon: '🍽️',
  schema: {
    type: 'object',
    required: ['title', 'slug', 'restaurantName', 'menus'],
    properties: {
      title: {
        type: 'string' as const,
        title: 'Title',
        required: true,
      },
      slug: {
        type: 'slug' as const,
        title: 'Slug',
        required: true,
      },
      restaurantName: {
        type: 'string' as const,
        title: 'Restaurant Name',
        required: true,
      },
      sourceUrl: {
        type: 'url' as const,
        title: 'Source URL',
      },
      sourceType: {
        type: 'string' as const,
        title: 'Source Type',
      },
      phone: {
        type: 'string' as const,
        title: 'Phone',
      },
      website: {
        type: 'url' as const,
        title: 'Website',
      },
      description: {
        type: 'textarea' as const,
        title: 'Description',
      },
      priceRange: {
        type: 'string' as const,
        title: 'Price Range',
      },
      categories: {
        type: 'array' as const,
        title: 'Categories',
        items: {
          type: 'string' as const,
          title: 'Category',
        },
      },
      serviceModes: serviceModesField,
      socialLinks: {
        type: 'array' as const,
        title: 'Social Links',
        items: socialLinkField,
      },
      menus: {
        type: 'array' as const,
        title: 'Menus',
        items: menuField,
      },
      importMeta: {
        type: 'json' as const,
        title: 'Import Metadata',
      },
    },
  },
  listFields: ['restaurantName', 'slug', 'sourceType', 'updatedAt'],
  searchFields: ['restaurantName', 'slug', 'description'],
  defaultSort: 'updatedAt',
  defaultSortOrder: 'desc',
  managed: true,
  isActive: true,
}

export default restaurantCollection
