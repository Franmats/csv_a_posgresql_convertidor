--
-- PostgreSQL database dump
--

\restrict 9emRTbNS7clkkxA2z8qdXW5BatUgao6qhj2xCE2ggnocbUlcSkmyz6u0TzrU4kw

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

-- Started on 2026-07-02 10:21:14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 276 (class 1255 OID 57443)
-- Name: update_timestamp_productos(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_timestamp_productos() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.nombre        IS DISTINCT FROM OLD.nombre OR
     NEW.descripcion   IS DISTINCT FROM OLD.descripcion OR
     NEW.imagen        IS DISTINCT FROM OLD.imagen OR
     NEW.tipo          IS DISTINCT FROM OLD.tipo OR
     NEW.rubro         IS DISTINCT FROM OLD.rubro OR
     NEW.activo        IS DISTINCT FROM OLD.activo
  THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_timestamp_productos() OWNER TO postgres;

--
-- TOC entry 275 (class 1255 OID 57470)
-- Name: update_timestamp_variantes(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_timestamp_variantes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF
    NEW.precio           IS DISTINCT FROM OLD.precio OR
    NEW.precio_descuento IS DISTINCT FROM OLD.precio_descuento OR
    NEW.stock            IS DISTINCT FROM OLD.stock OR
    NEW.atributos        IS DISTINCT FROM OLD.atributos OR
    NEW.codigo_barras    IS DISTINCT FROM OLD.codigo_barras OR
    NEW.activo           IS DISTINCT FROM OLD.activo
  THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_timestamp_variantes() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 268 (class 1259 OID 57764)
-- Name: producto_variantes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.producto_variantes (
    id integer NOT NULL,
    tienda_id integer NOT NULL,
    producto_codigo character varying NOT NULL,
    sku character varying,
    codigo_barras character varying,
    atributos jsonb DEFAULT '{}'::jsonb NOT NULL,
    precio numeric(10,2) NOT NULL,
    precio_descuento numeric(10,2),
    stock integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.producto_variantes OWNER TO postgres;

--
-- TOC entry 267 (class 1259 OID 57763)
-- Name: producto_variantes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.producto_variantes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.producto_variantes_id_seq OWNER TO postgres;

--
-- TOC entry 5017 (class 0 OID 0)
-- Dependencies: 267
-- Name: producto_variantes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.producto_variantes_id_seq OWNED BY public.producto_variantes.id;


--
-- TOC entry 266 (class 1259 OID 57744)
-- Name: productos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.productos (
    id integer NOT NULL,
    tienda_id integer NOT NULL,
    codigo character varying NOT NULL,
    nombre character varying NOT NULL,
    descripcion text,
    imagen character varying,
    tipo character varying DEFAULT 'simple'::character varying,
    activo boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT now(),
    rubro character varying
);


ALTER TABLE public.productos OWNER TO postgres;

--
-- TOC entry 265 (class 1259 OID 57743)
-- Name: productos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.productos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.productos_id_seq OWNER TO postgres;

--
-- TOC entry 5018 (class 0 OID 0)
-- Dependencies: 265
-- Name: productos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.productos_id_seq OWNED BY public.productos.id;


--
-- TOC entry 264 (class 1259 OID 57733)
-- Name: tiendas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tiendas (
    id integer NOT NULL,
    nombre character varying NOT NULL,
    wc_url character varying NOT NULL,
    wc_consumer_key character varying NOT NULL,
    wc_consumer_secret character varying NOT NULL,
    wc_webhook_secret character varying NOT NULL,
    csv_watch_dir character varying NOT NULL,
    pedidos_dir character varying NOT NULL,
    images_dir character varying NOT NULL,
    activo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.tiendas OWNER TO postgres;

--
-- TOC entry 263 (class 1259 OID 57732)
-- Name: tiendas_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tiendas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tiendas_id_seq OWNER TO postgres;

--
-- TOC entry 5019 (class 0 OID 0)
-- Dependencies: 263
-- Name: tiendas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tiendas_id_seq OWNED BY public.tiendas.id;


--
-- TOC entry 274 (class 1259 OID 58053)
-- Name: woocommerce_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.woocommerce_categories (
    id integer NOT NULL,
    tienda_id integer NOT NULL,
    nombre character varying NOT NULL,
    wc_category_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.woocommerce_categories OWNER TO postgres;

--
-- TOC entry 273 (class 1259 OID 58052)
-- Name: woocommerce_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.woocommerce_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.woocommerce_categories_id_seq OWNER TO postgres;

--
-- TOC entry 5020 (class 0 OID 0)
-- Dependencies: 273
-- Name: woocommerce_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.woocommerce_categories_id_seq OWNED BY public.woocommerce_categories.id;


--
-- TOC entry 272 (class 1259 OID 57814)
-- Name: woocommerce_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.woocommerce_orders (
    id integer NOT NULL,
    tienda_id integer NOT NULL,
    woocommerce_id integer NOT NULL,
    customer_email character varying,
    customer_dni character varying,
    total numeric(10,2),
    status character varying,
    payment_method character varying,
    raw_payload jsonb,
    invoiced boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.woocommerce_orders OWNER TO postgres;

--
-- TOC entry 271 (class 1259 OID 57813)
-- Name: woocommerce_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.woocommerce_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.woocommerce_orders_id_seq OWNER TO postgres;

--
-- TOC entry 5021 (class 0 OID 0)
-- Dependencies: 271
-- Name: woocommerce_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.woocommerce_orders_id_seq OWNED BY public.woocommerce_orders.id;


--
-- TOC entry 270 (class 1259 OID 57790)
-- Name: woocommerce_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.woocommerce_products (
    id integer NOT NULL,
    tienda_id integer NOT NULL,
    producto_codigo character varying NOT NULL,
    variante_id integer,
    woocommerce_id integer NOT NULL,
    wc_variation_id integer,
    last_synced_at timestamp without time zone,
    sync_status character varying DEFAULT 'pending'::character varying,
    error_message text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.woocommerce_products OWNER TO postgres;

--
-- TOC entry 269 (class 1259 OID 57789)
-- Name: woocommerce_products_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.woocommerce_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.woocommerce_products_id_seq OWNER TO postgres;

--
-- TOC entry 5022 (class 0 OID 0)
-- Dependencies: 269
-- Name: woocommerce_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.woocommerce_products_id_seq OWNED BY public.woocommerce_products.id;


--
-- TOC entry 4822 (class 2604 OID 57767)
-- Name: producto_variantes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes ALTER COLUMN id SET DEFAULT nextval('public.producto_variantes_id_seq'::regclass);


--
-- TOC entry 4818 (class 2604 OID 57747)
-- Name: productos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos ALTER COLUMN id SET DEFAULT nextval('public.productos_id_seq'::regclass);


--
-- TOC entry 4815 (class 2604 OID 57736)
-- Name: tiendas id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tiendas ALTER COLUMN id SET DEFAULT nextval('public.tiendas_id_seq'::regclass);


--
-- TOC entry 4834 (class 2604 OID 58056)
-- Name: woocommerce_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.woocommerce_categories ALTER COLUMN id SET DEFAULT nextval('public.woocommerce_categories_id_seq'::regclass);


--
-- TOC entry 4831 (class 2604 OID 57817)
-- Name: woocommerce_orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.woocommerce_orders ALTER COLUMN id SET DEFAULT nextval('public.woocommerce_orders_id_seq'::regclass);


--
-- TOC entry 4827 (class 2604 OID 57793)
-- Name: woocommerce_products id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.woocommerce_products ALTER COLUMN id SET DEFAULT nextval('public.woocommerce_products_id_seq'::regclass);


--
-- TOC entry 4846 (class 2606 OID 57775)
-- Name: producto_variantes producto_variantes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT producto_variantes_pkey PRIMARY KEY (id);


--
-- TOC entry 4839 (class 2606 OID 57754)
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id);


--
-- TOC entry 4841 (class 2606 OID 57756)
-- Name: productos productos_tienda_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_tienda_id_codigo_key UNIQUE (tienda_id, codigo);


--
-- TOC entry 4837 (class 2606 OID 57742)
-- Name: tiendas tiendas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tiendas
    ADD CONSTRAINT tiendas_pkey PRIMARY KEY (id);


--
-- TOC entry 4856 (class 2606 OID 58061)
-- Name: woocommerce_categories woocommerce_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.woocommerce_categories
    ADD CONSTRAINT woocommerce_categories_pkey PRIMARY KEY (id);


--
-- TOC entry 4858 (class 2606 OID 58063)
-- Name: woocommerce_categories woocommerce_categories_tienda_id_nombre_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.woocommerce_categories
    ADD CONSTRAINT woocommerce_categories_tienda_id_nombre_key UNIQUE (tienda_id, nombre);


--
-- TOC entry 4852 (class 2606 OID 57823)
-- Name: woocommerce_orders woocommerce_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.woocommerce_orders
    ADD CONSTRAINT woocommerce_orders_pkey PRIMARY KEY (id);


--
-- TOC entry 4854 (class 2606 OID 57825)
-- Name: woocommerce_orders woocommerce_orders_tienda_id_woocommerce_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.woocommerce_orders
    ADD CONSTRAINT woocommerce_orders_tienda_id_woocommerce_id_key UNIQUE (tienda_id, woocommerce_id);


--
-- TOC entry 4848 (class 2606 OID 57800)
-- Name: woocommerce_products woocommerce_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.woocommerce_products
    ADD CONSTRAINT woocommerce_products_pkey PRIMARY KEY (id);


--
-- TOC entry 4850 (class 2606 OID 57802)
-- Name: woocommerce_products woocommerce_products_tienda_id_producto_codigo_variante_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.woocommerce_products
    ADD CONSTRAINT woocommerce_products_tienda_id_producto_codigo_variante_id_key UNIQUE (tienda_id, producto_codigo, variante_id);


--
-- TOC entry 4842 (class 1259 OID 57786)
-- Name: idx_variantes_con_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_variantes_con_sku ON public.producto_variantes USING btree (tienda_id, producto_codigo, sku) WHERE (sku IS NOT NULL);


--
-- TOC entry 4843 (class 1259 OID 57831)
-- Name: idx_variantes_producto_codigo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_variantes_producto_codigo ON public.producto_variantes USING btree (tienda_id, producto_codigo);


--
-- TOC entry 4844 (class 1259 OID 57787)
-- Name: idx_variantes_sin_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_variantes_sin_sku ON public.producto_variantes USING btree (tienda_id, producto_codigo, atributos) WHERE (sku IS NULL);


--
-- TOC entry 4866 (class 2620 OID 57788)
-- Name: producto_variantes producto_variantes_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER producto_variantes_updated_at BEFORE UPDATE ON public.producto_variantes FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_variantes();


--
-- TOC entry 4865 (class 2620 OID 57762)
-- Name: productos productos_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER productos_updated_at BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_productos();


--
-- TOC entry 4860 (class 2606 OID 57781)
-- Name: producto_variantes producto_variantes_tienda_id_producto_codigo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT producto_variantes_tienda_id_producto_codigo_fkey FOREIGN KEY (tienda_id, producto_codigo) REFERENCES public.productos(tienda_id, codigo);


--
-- TOC entry 4859 (class 2606 OID 57757)
-- Name: productos productos_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id);


--
-- TOC entry 4864 (class 2606 OID 58064)
-- Name: woocommerce_categories woocommerce_categories_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.woocommerce_categories
    ADD CONSTRAINT woocommerce_categories_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id);


--
-- TOC entry 4863 (class 2606 OID 57826)
-- Name: woocommerce_orders woocommerce_orders_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.woocommerce_orders
    ADD CONSTRAINT woocommerce_orders_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id);


--
-- TOC entry 4861 (class 2606 OID 57803)
-- Name: woocommerce_products woocommerce_products_tienda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.woocommerce_products
    ADD CONSTRAINT woocommerce_products_tienda_id_fkey FOREIGN KEY (tienda_id) REFERENCES public.tiendas(id);


--
-- TOC entry 4862 (class 2606 OID 57808)
-- Name: woocommerce_products woocommerce_products_variante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.woocommerce_products
    ADD CONSTRAINT woocommerce_products_variante_id_fkey FOREIGN KEY (variante_id) REFERENCES public.producto_variantes(id);


-- Completed on 2026-07-02 10:21:14

--
-- PostgreSQL database dump complete
--

\unrestrict 9emRTbNS7clkkxA2z8qdXW5BatUgao6qhj2xCE2ggnocbUlcSkmyz6u0TzrU4kw

