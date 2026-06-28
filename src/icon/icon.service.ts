import { Injectable } from '@nestjs/common';
import type { IIcone } from './icons.data';

@Injectable()
export class IconService {
  private iconsPromise: Promise<IIcone[]> | null = null;

  private loadIcons(): Promise<IIcone[]> {
    if (!this.iconsPromise) {
      this.iconsPromise = import('./icons.data.js').then(
        (module) => module.iconsRepository,
      );
    }

    return this.iconsPromise;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private filterByName(icons: IIcone[], nome?: string): IIcone[] {
    if (!nome) {
      return icons;
    }

    const normalized = this.normalize(nome);

    return icons.filter(
      ({ icon, translatedName, variantNames }) =>
        this.normalize(icon).includes(normalized) ||
        this.normalize(translatedName).includes(normalized) ||
        variantNames.some((variant) =>
          this.normalize(variant).includes(normalized),
        ),
    );
  }

  async findAll(
    page: number,
    limit: number,
    nome?: string,
  ): Promise<{ data: string[]; total: number }> {
    const icons = await this.loadIcons();
    const filtered = this.filterByName(icons, nome);

    const data = filtered.slice(0, page * limit).map(({ icon }) => icon);

    return { data, total: filtered.length };
  }
}
