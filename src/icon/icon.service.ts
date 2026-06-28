import { Injectable } from '@nestjs/common';
import { iconsRepository, IIcone } from './icons.data';

@Injectable()
export class IconService {
  private readonly icons: IIcone[] = iconsRepository;

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private filterByName(nome?: string): IIcone[] {
    if (!nome) {
      return this.icons;
    }

    const normalized = this.normalize(nome);

    return this.icons.filter(
      ({ icon, translatedName, variantNames }) =>
        this.normalize(icon).includes(normalized) ||
        this.normalize(translatedName).includes(normalized) ||
        variantNames.some((variant) =>
          this.normalize(variant).includes(normalized),
        ),
    );
  }

  findAll(
    page: number,
    limit: number,
    nome?: string,
  ): { data: string[]; total: number } {
    const filtered = this.filterByName(nome);

    const data = filtered.slice(0, page * limit).map(({ icon }) => icon);

    return { data, total: filtered.length };
  }
}
