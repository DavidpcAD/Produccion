-- FKs de la réplica pro_* (WITH NOCHECK — tolera huérfanos legacy). 2026-08-04

ALTER TABLE [pro_app].[avance_obra_snapshot] WITH NOCHECK ADD CONSTRAINT [FK_avance_caso] FOREIGN KEY ([IDCaso]) REFERENCES [pro_ventas].[Casos] ([IDCaso]);
GO
ALTER TABLE [pro_app].[avance_obra_snapshot] WITH NOCHECK ADD CONSTRAINT [FK_avance_lote] FOREIGN KEY ([IDLote]) REFERENCES [pro_ventas].[Lotes] ([IDLote]);
GO
ALTER TABLE [pro_app].[banco_esquema_desembolso] WITH NOCHECK ADD CONSTRAINT [FK_esquema_banco] FOREIGN KEY ([IDBan]) REFERENCES [pro_ventas].[Bancos] ([IDBan]);
GO
ALTER TABLE [pro_app].[banco_esquema_desembolso] WITH NOCHECK ADD CONSTRAINT [FK_esquema_hito] FOREIGN KEY ([IDHito]) REFERENCES [pro_app].[catalogo_hito] ([IDHito]);
GO
ALTER TABLE [pro_app].[banco_valoracion_lote] WITH NOCHECK ADD CONSTRAINT [FK_valoracion_banco] FOREIGN KEY ([IDBan]) REFERENCES [pro_ventas].[Bancos] ([IDBan]);
GO
ALTER TABLE [pro_app].[banco_valoracion_lote] WITH NOCHECK ADD CONSTRAINT [FK_bvl_proyecto] FOREIGN KEY ([IDProyecto]) REFERENCES [pro_ventas].[Proyecto] ([IDProyecto]);
GO
ALTER TABLE [pro_app].[caso_extra] WITH NOCHECK ADD CONSTRAINT [FK_caso_extra_caso] FOREIGN KEY ([IDCaso]) REFERENCES [pro_ventas].[Casos] ([IDCaso]);
GO
ALTER TABLE [pro_app].[caso_hito_proyeccion] WITH NOCHECK ADD CONSTRAINT [FK_chp_caso] FOREIGN KEY ([IDCaso]) REFERENCES [pro_ventas].[Casos] ([IDCaso]);
GO
ALTER TABLE [pro_app].[caso_hito_proyeccion] WITH NOCHECK ADD CONSTRAINT [FK_chp_hito] FOREIGN KEY ([IDHito]) REFERENCES [pro_app].[catalogo_hito] ([IDHito]);
GO
ALTER TABLE [pro_app].[caso_hito_proyeccion] WITH NOCHECK ADD CONSTRAINT [FK_chp_esquema] FOREIGN KEY ([IDEsquema]) REFERENCES [pro_app].[banco_esquema_desembolso] ([IDEsquema]);
GO
ALTER TABLE [pro_app].[caso_hito_proyeccion] WITH NOCHECK ADD CONSTRAINT [FK_chp_mov] FOREIGN KEY ([IDMovimiento]) REFERENCES [pro_ventas].[Movimientos] ([IDMovimiento]);
GO
ALTER TABLE [pro_app].[caso_lote_banco] WITH NOCHECK ADD CONSTRAINT [FK_clb_caso] FOREIGN KEY ([IDCaso]) REFERENCES [pro_ventas].[Casos] ([IDCaso]);
GO
ALTER TABLE [pro_app].[credito_puente] WITH NOCHECK ADD CONSTRAINT [FK_credito_puente_banco] FOREIGN KEY ([IDBan]) REFERENCES [pro_ventas].[Bancos] ([IDBan]);
GO
ALTER TABLE [pro_app].[credito_puente_esquema_hito] WITH NOCHECK ADD CONSTRAINT [FK_cpeh_credito] FOREIGN KEY ([IDCreditoPuente]) REFERENCES [pro_app].[credito_puente] ([IDCreditoPuente]);
GO
ALTER TABLE [pro_app].[credito_puente_esquema_hito] WITH NOCHECK ADD CONSTRAINT [FK_cpeh_hito] FOREIGN KEY ([IDHito]) REFERENCES [pro_app].[catalogo_hito] ([IDHito]);
GO
ALTER TABLE [pro_app].[credito_puente_link] WITH NOCHECK ADD CONSTRAINT [FK_cplnk_lote_hito] FOREIGN KEY ([IDCreditoPuenteLoteHito]) REFERENCES [pro_app].[credito_puente_lote_hito] ([IDCreditoPuenteLoteHito]);
GO
ALTER TABLE [pro_app].[credito_puente_link] WITH NOCHECK ADD CONSTRAINT [FK_cplnk_mov] FOREIGN KEY ([IDMovCP]) REFERENCES [pro_app].[credito_puente_movimiento] ([IDMovCP]);
GO
ALTER TABLE [pro_app].[credito_puente_lote] WITH NOCHECK ADD CONSTRAINT [FK_cpl_credito] FOREIGN KEY ([IDCreditoPuente]) REFERENCES [pro_app].[credito_puente] ([IDCreditoPuente]);
GO
ALTER TABLE [pro_app].[credito_puente_lote] WITH NOCHECK ADD CONSTRAINT [FK_cpl_lote] FOREIGN KEY ([IDLote]) REFERENCES [pro_ventas].[Lotes] ([IDLote]);
GO
ALTER TABLE [pro_app].[credito_puente_lote_hito] WITH NOCHECK ADD CONSTRAINT [FK_cplh_lote] FOREIGN KEY ([IDCreditoPuenteLote]) REFERENCES [pro_app].[credito_puente_lote] ([IDCreditoPuenteLote]);
GO
ALTER TABLE [pro_app].[credito_puente_lote_hito] WITH NOCHECK ADD CONSTRAINT [FK_cplh_hito] FOREIGN KEY ([IDHito]) REFERENCES [pro_app].[catalogo_hito] ([IDHito]);
GO
ALTER TABLE [pro_app].[credito_puente_movimiento] WITH NOCHECK ADD CONSTRAINT [FK_cpmov_credito] FOREIGN KEY ([IDCreditoPuente]) REFERENCES [pro_app].[credito_puente] ([IDCreditoPuente]);
GO
ALTER TABLE [pro_app].[distribucion_config] WITH NOCHECK ADD CONSTRAINT [FK_distribucion_config_proyecto] FOREIGN KEY ([IDProyecto]) REFERENCES [pro_ventas].[Proyecto] ([IDProyecto]);
GO
ALTER TABLE [pro_app].[distribucion_config_entidad] WITH NOCHECK ADD CONSTRAINT [FK_dce_entidad] FOREIGN KEY ([IDEntidad]) REFERENCES [pro_app].[catalogo_entidad_distribucion] ([IDEntidad]);
GO
ALTER TABLE [pro_app].[distribucion_config_entidad] WITH NOCHECK ADD CONSTRAINT [FK_dce_config] FOREIGN KEY ([IDConfig]) REFERENCES [pro_app].[distribucion_config] ([IDConfig]);
GO
ALTER TABLE [pro_app].[liquidacion_lote_override] WITH NOCHECK ADD CONSTRAINT [FK_lloverride_mov] FOREIGN KEY ([IDMovimiento]) REFERENCES [pro_ventas].[Movimientos] ([IDMovimiento]);
GO
ALTER TABLE [pro_app].[movimiento_hito_link] WITH NOCHECK ADD CONSTRAINT [FK_link_movimiento] FOREIGN KEY ([IDMovimiento]) REFERENCES [pro_ventas].[Movimientos] ([IDMovimiento]);
GO
ALTER TABLE [pro_app].[movimiento_hito_link] WITH NOCHECK ADD CONSTRAINT [FK_link_caso_hito] FOREIGN KEY ([IDCasoHito]) REFERENCES [pro_app].[caso_hito_proyeccion] ([IDCasoHito]);
GO
ALTER TABLE [pro_app].[pago_cliente] WITH NOCHECK ADD CONSTRAINT [FK_pago_cliente_caso] FOREIGN KEY ([IDCaso]) REFERENCES [pro_ventas].[Casos] ([IDCaso]);
GO
ALTER TABLE [pro_app].[pago_cliente] WITH NOCHECK ADD CONSTRAINT [FK_pago_cliente_movimiento] FOREIGN KEY ([IDMovimientoVinculado]) REFERENCES [pro_ventas].[Movimientos] ([IDMovimiento]);
GO
ALTER TABLE [pro_app].[pago_cliente_mov_link] WITH NOCHECK ADD CONSTRAINT [FK_pclink_pago] FOREIGN KEY ([IDPago]) REFERENCES [pro_app].[pago_cliente] ([IDPago]);
GO
ALTER TABLE [pro_app].[pago_cliente_mov_link] WITH NOCHECK ADD CONSTRAINT [FK_pclink_movimiento] FOREIGN KEY ([IDMovimiento]) REFERENCES [pro_ventas].[Movimientos] ([IDMovimiento]);
GO
ALTER TABLE [pro_app].[proyeccion_formalizacion] WITH NOCHECK ADD CONSTRAINT [FK_proy_form_caso] FOREIGN KEY ([IDCaso]) REFERENCES [pro_ventas].[Casos] ([IDCaso]);
GO
ALTER TABLE [pro_bi].[fact_presupuesto] WITH NOCHECK ADD CONSTRAINT [fk_bi_fact_presupuesto_sk_obra] FOREIGN KEY ([sk_obra]) REFERENCES [pro_bi].[dim_obra] ([sk_obra]);
GO
ALTER TABLE [pro_ventas].[Casos] WITH NOCHECK ADD CONSTRAINT [FK_Casos_Lote] FOREIGN KEY ([IDLote]) REFERENCES [pro_ventas].[Lotes] ([IDLote]);
GO
ALTER TABLE [pro_ventas].[Casos] WITH NOCHECK ADD CONSTRAINT [FK_Casos_Estado] FOREIGN KEY ([IDEstado]) REFERENCES [pro_ventas].[Estados] ([IDEst]);
GO
ALTER TABLE [pro_ventas].[Casos] WITH NOCHECK ADD CONSTRAINT [FK_Casos_Banco] FOREIGN KEY ([IDBanco]) REFERENCES [pro_ventas].[Bancos] ([IDBan]);
GO
ALTER TABLE [pro_ventas].[Casos] WITH NOCHECK ADD CONSTRAINT [FK_Casos_Codeudor] FOREIGN KEY ([IDCodeudor]) REFERENCES [pro_ventas].[Clientes] ([IDCliente]);
GO
ALTER TABLE [pro_ventas].[Casos] WITH NOCHECK ADD CONSTRAINT [FK_Casos_Cliente] FOREIGN KEY ([IDCliente]) REFERENCES [pro_ventas].[Clientes] ([IDCliente]);
GO
ALTER TABLE [pro_ventas].[Casos] WITH NOCHECK ADD CONSTRAINT [FK_Casos_Vendedor] FOREIGN KEY ([IDVendedor]) REFERENCES [pro_ventas].[Colaboradores] ([IDCol]);
GO
ALTER TABLE [pro_ventas].[Casos] WITH NOCHECK ADD CONSTRAINT [FK_Casos_Formalizador] FOREIGN KEY ([IDFormalizador]) REFERENCES [pro_ventas].[Colaboradores] ([IDCol]);
GO
ALTER TABLE [pro_ventas].[Casos] WITH NOCHECK ADD CONSTRAINT [FK_Casos_Modelo] FOREIGN KEY ([IDModelo]) REFERENCES [pro_ventas].[Modelos] ([IDMod]);
GO
ALTER TABLE [pro_ventas].[Lotes] WITH NOCHECK ADD CONSTRAINT [FK_Lotes_Bloques] FOREIGN KEY ([IDBloque]) REFERENCES [pro_ventas].[Bloques] ([IDBloq]);
GO
ALTER TABLE [pro_ventas].[Movimientos] WITH NOCHECK ADD CONSTRAINT [FK_Movimientos_TipMovi] FOREIGN KEY ([IDTipmov]) REFERENCES [pro_ventas].[TipMovi] ([IDTmov]);
GO
ALTER TABLE [pro_hor].[batches] WITH NOCHECK ADD CONSTRAINT [fk_batches_importacion] FOREIGN KEY ([id_importacion]) REFERENCES [pro_hor].[importaciones_csv] ([id]);
GO
ALTER TABLE [pro_hor].[batches] WITH NOCHECK ADD CONSTRAINT [FK__batches__id_plan__3DB3F0E4] FOREIGN KEY ([id_planta]) REFERENCES [pro_hor].[plantas] ([id]);
GO
ALTER TABLE [pro_hor].[batches] WITH NOCHECK ADD CONSTRAINT [FK__batches__id_rece__3EA8151D] FOREIGN KEY ([id_receta_blend]) REFERENCES [pro_hor].[recetas_blend] ([id]);
GO
ALTER TABLE [pro_hor].[batches_alarmas] WITH NOCHECK ADD CONSTRAINT [FK__batches_a__id_ba__4B0DEC02] FOREIGN KEY ([id_batch]) REFERENCES [pro_hor].[batches] ([id]);
GO
ALTER TABLE [pro_hor].[cilindros] WITH NOCHECK ADD CONSTRAINT [FK__cilindros__id_co__3D7EE6BA] FOREIGN KEY ([id_colada]) REFERENCES [pro_hor].[coladas] ([id_colada]);
GO
ALTER TABLE [pro_hor].[colada_batches] WITH NOCHECK ADD CONSTRAINT [FK__colada_ba__id_ba__4EA972BC] FOREIGN KEY ([id_batch]) REFERENCES [pro_hor].[batches] ([id]);
GO
ALTER TABLE [pro_hor].[colada_batches] WITH NOCHECK ADD CONSTRAINT [FK__colada_ba__id_co__4DB54E83] FOREIGN KEY ([id_colada]) REFERENCES [pro_hor].[coladas] ([id_colada]);
GO
ALTER TABLE [pro_hor].[coladas] WITH NOCHECK ADD CONSTRAINT [fk_coladas_destino_canonico] FOREIGN KEY ([id_destino_canonico]) REFERENCES [pro_hor].[destinos_canonicos] ([id_destino_canonico]);
GO
ALTER TABLE [pro_hor].[coladas] WITH NOCHECK ADD CONSTRAINT [FK__coladas__id_plan__3024EB9C] FOREIGN KEY ([id_planta]) REFERENCES [pro_hor].[plantas] ([id]);
GO
ALTER TABLE [pro_hor].[coladas] WITH NOCHECK ADD CONSTRAINT [FK__coladas__id_rece__320D340E] FOREIGN KEY ([id_receta_bc]) REFERENCES [pro_hor].[recetas_bc] ([id]);
GO
ALTER TABLE [pro_hor].[coladas] WITH NOCHECK ADD CONSTRAINT [FK__coladas__id_rece__31190FD5] FOREIGN KEY ([id_receta_blend]) REFERENCES [pro_hor].[recetas_blend] ([id]);
GO
ALTER TABLE [pro_hor].[destino_alias] WITH NOCHECK ADD CONSTRAINT [FK__destino_a__id_de__48F09966] FOREIGN KEY ([id_destino_canonico]) REFERENCES [pro_hor].[destinos_canonicos] ([id_destino_canonico]);
GO
ALTER TABLE [pro_hor].[importaciones_csv] WITH NOCHECK ADD CONSTRAINT [FK__importaci__id_pl__5C387804] FOREIGN KEY ([id_planta]) REFERENCES [pro_hor].[plantas] ([id]);
GO
ALTER TABLE [pro_hor].[mapeo_recetas] WITH NOCHECK ADD CONSTRAINT [FK__mapeo_rec__id_re__536E27D9] FOREIGN KEY ([id_receta_blend]) REFERENCES [pro_hor].[recetas_blend] ([id]);
GO
ALTER TABLE [pro_hor].[mapeo_recetas] WITH NOCHECK ADD CONSTRAINT [FK__mapeo_rec__id_re__54624C12] FOREIGN KEY ([id_receta_bc]) REFERENCES [pro_hor].[recetas_bc] ([id]);
GO
ALTER TABLE [pro_hor].[recetas_blend] WITH NOCHECK ADD CONSTRAINT [FK__recetas_b__id_pl__3612CF1C] FOREIGN KEY ([id_planta]) REFERENCES [pro_hor].[plantas] ([id]);
GO
ALTER TABLE [pro_hor].[recetas_blend] WITH NOCHECK ADD CONSTRAINT [FK__recetas_b__id_re__3706F355] FOREIGN KEY ([id_receta_bc]) REFERENCES [pro_hor].[recetas_bc] ([id]);
GO
ALTER TABLE [pro_lab].[ensayos] WITH NOCHECK ADD CONSTRAINT [FK_lab_ensayos_muestra] FOREIGN KEY ([id_muestra]) REFERENCES [pro_lab].[muestras] ([id]);
GO
ALTER TABLE [pro_lab].[esclerometro_rebotes] WITH NOCHECK ADD CONSTRAINT [FK_lab_esclerometro_rebote_ensayo] FOREIGN KEY ([id_ensayo]) REFERENCES [pro_lab].[esclerometro_ensayos] ([id]);
GO
ALTER TABLE [pro_lab].[fotos_muestra] WITH NOCHECK ADD CONSTRAINT [FK_lab_fotos_muestra_muestra] FOREIGN KEY ([id_muestra]) REFERENCES [pro_lab].[muestras] ([id]);
GO
ALTER TABLE [pro_lab].[mediciones] WITH NOCHECK ADD CONSTRAINT [FK_lab_mediciones_ensayo] FOREIGN KEY ([id_ensayo]) REFERENCES [pro_lab].[ensayos] ([id]);
GO
ALTER TABLE [pro_lab].[muestras] WITH NOCHECK ADD CONSTRAINT [FK_lab_muestras_colada] FOREIGN KEY ([id_colada]) REFERENCES [pro_hor].[coladas] ([id_colada]);
GO
ALTER TABLE [pro_lab].[muestras] WITH NOCHECK ADD CONSTRAINT [FK_lab_muestras_receta] FOREIGN KEY ([id_receta_bc]) REFERENCES [pro_hor].[recetas_bc] ([id]);
GO
ALTER TABLE [pro_lab].[muestras] WITH NOCHECK ADD CONSTRAINT [FK_lab_muestras_actividad] FOREIGN KEY ([id_actividad]) REFERENCES [pro_lab].[actividades] ([id]);
GO
ALTER TABLE [pro_obc].[avance_semanal_obra] WITH NOCHECK ADD CONSTRAINT [FK_aso_semana] FOREIGN KEY ([semana_operativa_id]) REFERENCES [pro_obc].[semanas_operativas] ([id]);
GO
ALTER TABLE [pro_obc].[avance_sub_partidas] WITH NOCHECK ADD CONSTRAINT [FK_avance_usuario] FOREIGN KEY ([usuario_id]) REFERENCES [pro_obc].[usuarios_app] ([id]);
GO
ALTER TABLE [pro_obc].[avance_sub_partidas] WITH NOCHECK ADD CONSTRAINT [FK_avance_sp] FOREIGN KEY ([sub_partida_id]) REFERENCES [pro_obc].[sub_partidas] ([id]);
GO
ALTER TABLE [pro_obc].[cierre_produccion_snapshots] WITH NOCHECK ADD CONSTRAINT [FK_cps_cierre] FOREIGN KEY ([cierre_produccion_id]) REFERENCES [pro_obc].[cierres_produccion] ([id]);
GO
ALTER TABLE [pro_obc].[cierre_produccion_snapshots] WITH NOCHECK ADD CONSTRAINT [FK_cps_sp] FOREIGN KEY ([sub_partida_id]) REFERENCES [pro_obc].[sub_partidas] ([id]);
GO
ALTER TABLE [pro_obc].[cierres_produccion] WITH NOCHECK ADD CONSTRAINT [FK_cp_semana] FOREIGN KEY ([semana_operativa_id]) REFERENCES [pro_obc].[semanas_operativas] ([id]);
GO
ALTER TABLE [pro_obc].[control_nomina_semanal] WITH NOCHECK ADD CONSTRAINT [FK_cns_semana] FOREIGN KEY ([semana_operativa_id]) REFERENCES [pro_obc].[semanas_operativas] ([id]);
GO
ALTER TABLE [pro_obc].[control_nomina_semanal] WITH NOCHECK ADD CONSTRAINT [FK_cns_usuario] FOREIGN KEY ([creado_por]) REFERENCES [pro_obc].[usuarios_app] ([id]);
GO
ALTER TABLE [pro_obc].[cortes_nomina] WITH NOCHECK ADD CONSTRAINT [FK_cn_semana_fin] FOREIGN KEY ([semana_op_fin_id]) REFERENCES [pro_obc].[semanas_operativas] ([id]);
GO
ALTER TABLE [pro_obc].[cortes_nomina] WITH NOCHECK ADD CONSTRAINT [FK_cn_semana_ini] FOREIGN KEY ([semana_op_inicio_id]) REFERENCES [pro_obc].[semanas_operativas] ([id]);
GO
ALTER TABLE [pro_obc].[historial_estado_venta] WITH NOCHECK ADD CONSTRAINT [FK_hev_semana] FOREIGN KEY ([semana_operativa_id]) REFERENCES [pro_obc].[semanas_operativas] ([id]);
GO
ALTER TABLE [pro_obc].[horas_obra_semanal] WITH NOCHECK ADD CONSTRAINT [FK_hos_semana] FOREIGN KEY ([semana_operativa_id]) REFERENCES [pro_obc].[semanas_operativas] ([id]);
GO
ALTER TABLE [pro_obc].[obra_estado] WITH NOCHECK ADD CONSTRAINT [FK_obra_estado_usuario] FOREIGN KEY ([actualizado_por]) REFERENCES [pro_obc].[usuarios_app] ([id]);
GO
ALTER TABLE [pro_obc].[obra_estado] WITH NOCHECK ADD CONSTRAINT [FK_obra_estado_tc] FOREIGN KEY ([tipo_casa]) REFERENCES [pro_obc].[tipos_casa] ([codigo]);
GO
ALTER TABLE [pro_obc].[obra_pesos] WITH NOCHECK ADD CONSTRAINT [FK_obra_pesos_sp] FOREIGN KEY ([sub_partida_id]) REFERENCES [pro_obc].[sub_partidas] ([id]);
GO
ALTER TABLE [pro_obc].[obra_pesos] WITH NOCHECK ADD CONSTRAINT [FK_obra_pesos_tc] FOREIGN KEY ([tipo_casa]) REFERENCES [pro_obc].[tipos_casa] ([codigo]);
GO
ALTER TABLE [pro_obc].[obra_sub_partidas_excluidas] WITH NOCHECK ADD CONSTRAINT [FK_obra_sp_excl_sp] FOREIGN KEY ([sub_partida_id]) REFERENCES [pro_obc].[sub_partidas] ([id]);
GO
ALTER TABLE [pro_obc].[otp_codigos] WITH NOCHECK ADD CONSTRAINT [FK_otp_usuario] FOREIGN KEY ([usuario_id]) REFERENCES [pro_obc].[usuarios_app] ([id]);
GO
ALTER TABLE [pro_obc].[partidas] WITH NOCHECK ADD CONSTRAINT [FK_partidas_grupo] FOREIGN KEY ([grupo_id]) REFERENCES [pro_obc].[grupos_partida] ([id]);
GO
ALTER TABLE [pro_obc].[plan_semanal] WITH NOCHECK ADD CONSTRAINT [FK_plan_semana] FOREIGN KEY ([semana_operativa_id]) REFERENCES [pro_obc].[semanas_operativas] ([id]);
GO
ALTER TABLE [pro_obc].[sprints_cerrados] WITH NOCHECK ADD CONSTRAINT [FK_sc_semana] FOREIGN KEY ([semana_operativa_id]) REFERENCES [pro_obc].[semanas_operativas] ([id]);
GO
ALTER TABLE [pro_obc].[sub_partida_pesos_partida] WITH NOCHECK ADD CONSTRAINT [FK_spp_partida] FOREIGN KEY ([partida_id]) REFERENCES [pro_obc].[partidas] ([id]);
GO
ALTER TABLE [pro_obc].[sub_partida_pesos_partida] WITH NOCHECK ADD CONSTRAINT [FK_spp_tipo] FOREIGN KEY ([tipo_casa]) REFERENCES [pro_obc].[tipos_casa] ([codigo]);
GO
ALTER TABLE [pro_obc].[sub_partida_pesos_partida] WITH NOCHECK ADD CONSTRAINT [FK_spp_sub] FOREIGN KEY ([sub_partida_id]) REFERENCES [pro_obc].[sub_partidas] ([id]);
GO
ALTER TABLE [pro_obc].[sub_partida_pesos_sprint] WITH NOCHECK ADD CONSTRAINT [FK_spps_sub] FOREIGN KEY ([sub_partida_id]) REFERENCES [pro_obc].[sub_partidas] ([id]);
GO
ALTER TABLE [pro_obc].[sub_partida_pesos_sprint] WITH NOCHECK ADD CONSTRAINT [FK_spps_tipo] FOREIGN KEY ([tipo_casa]) REFERENCES [pro_obc].[tipos_casa] ([codigo]);
GO
ALTER TABLE [pro_obc].[sub_partida_tipos] WITH NOCHECK ADD CONSTRAINT [FK_spt_tipo] FOREIGN KEY ([tipo_casa]) REFERENCES [pro_obc].[tipos_casa] ([codigo]);
GO
ALTER TABLE [pro_obc].[sub_partida_tipos] WITH NOCHECK ADD CONSTRAINT [FK_spt_sub] FOREIGN KEY ([sub_partida_id]) REFERENCES [pro_obc].[sub_partidas] ([id]);
GO
ALTER TABLE [pro_obc].[sub_partidas] WITH NOCHECK ADD CONSTRAINT [FK_sub_partidas_partida] FOREIGN KEY ([partida_id]) REFERENCES [pro_obc].[partidas] ([id]);
GO
ALTER TABLE [pro_obc].[subcontratos_obra_semanal] WITH NOCHECK ADD CONSTRAINT [FK_sos_semana] FOREIGN KEY ([semana_operativa_id]) REFERENCES [pro_obc].[semanas_operativas] ([id]);
GO
ALTER TABLE [pro_obc].[tipo_casa_config] WITH NOCHECK ADD CONSTRAINT [FK_tipo_casa_config] FOREIGN KEY ([tipo_casa]) REFERENCES [pro_obc].[tipos_casa] ([codigo]);
GO
ALTER TABLE [pro_obc].[tipo_casa_sprints] WITH NOCHECK ADD CONSTRAINT [FK_tipo_casa_sprints] FOREIGN KEY ([tipo_casa]) REFERENCES [pro_obc].[tipos_casa] ([codigo]);
GO
ALTER TABLE [pro_obc].[tipo_construccion_sprints] WITH NOCHECK ADD CONSTRAINT [FK_tc_sprints_sprint] FOREIGN KEY ([sprint_id]) REFERENCES [pro_obc].[sprints_catalogo] ([id]);
GO
ALTER TABLE [pro_obc].[tipo_construccion_sprints] WITH NOCHECK ADD CONSTRAINT [FK_tc_sprints_tipo] FOREIGN KEY ([tipo_casa]) REFERENCES [pro_obc].[tipos_casa] ([codigo]);
GO
